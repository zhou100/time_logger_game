"""
/api/v1/entries — privacy-first two-phase upload flow.

Security model
──────────────
• All endpoints require authentication (get_current_user dependency).
• Entry rows are always filtered by user_id — no cross-user access is possible
  at the query level.
• The R2/MinIO bucket is PRIVATE — no object is ever publicly readable.
  Audio is only accessible via short-lived presigned GET URLs returned by
  GET /entries/{id}/audio, which verifies ownership first.
• The storage key (audio/{user_id}/{entry_id}.ext) is never exposed to the
  client. Instead, the presign phase issues a signed "upload token" (a
  short-lived JWT). The client treats it as opaque and echoes it back on
  submit. The backend decodes + verifies the token to recover the key.
  This means a client cannot forge or substitute another user's storage key.
• Presign is rate-limited to prevent storage abuse.

Upload flow
───────────
  Phase 1  POST /entries/presign
           → { entry_id, upload_url, upload_token }
           upload_url : presigned PUT URL (1 hr), client PUTs audio directly to storage
           upload_token: signed JWT encoding { user_id, entry_id, audio_key }, 1 hr TTL

  Phase 2  PUT audio to upload_url   (browser → MinIO/R2, app server not involved)

  Phase 3  POST /entries/{id}/submit  { upload_token, recorded_at?, duration_seconds? }
           Backend verifies token, creates Entry, enqueues processing job.

  Polling  GET /entries/{id}/status  (or receive push via WebSocket)
  Audio    GET /entries/{id}/audio   → 15-min presigned GET URL (owner only)
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db import get_db
from ...models.entry import Entry
from ...models.user import User
from ...services import queue as queue_svc
from ...services import storage as storage_svc
from ...settings import settings
from ...utils.auth import get_current_user

import logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/entries", tags=["entries"])

_UPLOAD_TOKEN_TTL_SECONDS = 3600   # must match presigned PUT expiry
_AUDIO_URL_TTL_SECONDS = 900       # 15-min presigned GET for playback


# ── Upload token helpers ──────────────────────────────────────────────────────

def _make_upload_token(user_id: int, entry_id: str, audio_key: str) -> str:
    """
    Issue a signed, short-lived JWT that encodes the storage key.
    The client echoes this back on submit — it never sees the raw key.
    """
    expire = datetime.now(timezone.utc) + timedelta(seconds=_UPLOAD_TOKEN_TTL_SECONDS)
    payload = {
        "sub": str(user_id),
        "entry_id": entry_id,
        "audio_key": audio_key,
        "exp": expire,
        "type": "upload",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _verify_upload_token(token: str, current_user_id: int) -> dict:
    """
    Verify the upload token and return its payload.
    Raises HTTP 400 on any failure — never leaks which part failed.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid upload token")

    if payload.get("type") != "upload":
        raise HTTPException(status_code=400, detail="Invalid upload token")

    try:
        token_user_id = int(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid upload token")

    if token_user_id != current_user_id:
        # Log attempted cross-user submission — indicates a tampered token
        logger.warning(
            f"Upload token user mismatch: token.sub={token_user_id} "
            f"current_user={current_user_id}"
        )
        raise HTTPException(status_code=400, detail="Invalid upload token")

    return payload


# ── Schemas ───────────────────────────────────────────────────────────────────

class PresignResponse(BaseModel):
    entry_id: str
    upload_url: str
    upload_token: str   # opaque signed token; echo back on submit


class SubmitRequest(BaseModel):
    upload_token: str               # must match the token from presign
    recorded_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None


class SubmitResponse(BaseModel):
    entry_id: str
    job_id: str


class EntryStatusResponse(BaseModel):
    entry_id: str
    job_id: Optional[str]
    status: str         # pending | processing | done | failed | unknown
    step: Optional[str]
    transcript: Optional[str]
    category: Optional[str]
    confidence: Optional[float]


class AudioUrlResponse(BaseModel):
    url: str            # presigned GET URL, valid for 15 minutes
    expires_in_seconds: int


class EntryItem(BaseModel):
    id: str
    transcript: Optional[str]
    recorded_at: Optional[str]
    created_at: str
    duration_seconds: Optional[int]
    category: Optional[str]
    confidence: Optional[float]
    # raw_audio_key intentionally omitted — use GET /entries/{id}/audio


class EntryListResponse(BaseModel):
    items: List[EntryItem]
    total: int
    skip: int
    limit: int


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/presign", response_model=PresignResponse)
async def presign_upload(
    request: Request,
    content_type: str = "audio/webm",
    current_user: User = Depends(get_current_user),
):
    """
    Phase 1: generate a presigned PUT URL for direct client → storage upload.

    Returns an upload_token that encodes the storage key. The client must echo
    this token back on /submit — the raw key is never exposed.

    Rate-limited to 30 requests per user per hour.
    """
    # Per-user rate limit (use user_id so IP-based bypass isn't possible)
    _check_presign_rate(request, current_user.id)

    entry_id = str(uuid.uuid4())
    suffix = _content_type_to_suffix(content_type)
    audio_key = storage_svc.make_audio_key(current_user.id, entry_id, suffix)

    upload_url = await storage_svc.generate_presigned_put(
        audio_key, content_type, expires_in=_UPLOAD_TOKEN_TTL_SECONDS
    )
    upload_token = _make_upload_token(current_user.id, entry_id, audio_key)

    logger.info(f"Presign issued: user={current_user.id} entry={entry_id}")
    return PresignResponse(
        entry_id=entry_id,
        upload_url=upload_url,
        upload_token=upload_token,
    )


@router.post("/{entry_id}/submit", response_model=SubmitResponse)
async def submit_entry(
    entry_id: str,
    body: SubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Phase 3: register the entry and enqueue it for processing.

    The upload_token (from presign) is verified server-side to recover the
    storage key. The client never sends the key directly.
    """
    try:
        entry_uuid = uuid.UUID(entry_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid entry_id")

    # Verify token and extract the storage key — raises 400 on any failure
    token_payload = _verify_upload_token(body.upload_token, current_user.id)

    # Double-check the entry_id in the token matches the URL path parameter
    if token_payload.get("entry_id") != entry_id:
        logger.warning(
            f"entry_id mismatch: path={entry_id} token={token_payload.get('entry_id')} "
            f"user={current_user.id}"
        )
        raise HTTPException(status_code=400, detail="Invalid upload token")

    audio_key = token_payload["audio_key"]

    entry = Entry(
        id=entry_uuid,
        user_id=current_user.id,
        raw_audio_key=audio_key,
        recorded_at=body.recorded_at,
        duration_seconds=body.duration_seconds,
    )
    db.add(entry)
    await db.flush()

    job = await queue_svc.enqueue(db, entry_uuid, current_user.id)
    await db.commit()

    logger.info(f"Entry {entry_id} submitted → job {job.id} (user={current_user.id})")
    return SubmitResponse(entry_id=entry_id, job_id=str(job.id))


@router.get("/{entry_id}/audio", response_model=AudioUrlResponse)
async def get_audio_url(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return a short-lived (15-min) presigned GET URL for the entry's audio file.

    Only the owner can request this. The URL is time-limited so it cannot be
    shared for long-term access, and the underlying bucket is private so the
    key alone grants no access.
    """
    try:
        entry_uuid = uuid.UUID(entry_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid entry_id")

    result = await db.execute(
        select(Entry).where(Entry.id == entry_uuid, Entry.user_id == current_user.id)
    )
    entry = result.scalar_one_or_none()

    if not entry:
        # Return 404 regardless of whether the entry exists but belongs to another
        # user — never reveal that a resource exists
        raise HTTPException(status_code=404, detail="Entry not found")

    if not entry.raw_audio_key:
        raise HTTPException(status_code=404, detail="Audio not available yet")

    url = await storage_svc.generate_presigned_get(
        entry.raw_audio_key, expires_in=_AUDIO_URL_TTL_SECONDS
    )
    return AudioUrlResponse(url=url, expires_in_seconds=_AUDIO_URL_TTL_SECONDS)


@router.get("/{entry_id}/status", response_model=EntryStatusResponse)
async def get_entry_status(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Poll the processing status of an entry. Owner-only."""
    try:
        entry_uuid = uuid.UUID(entry_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid entry_id")

    result = await db.execute(
        select(Entry).where(Entry.id == entry_uuid, Entry.user_id == current_user.id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    job = await queue_svc.get_job_for_entry(db, entry_uuid)

    category = entry.classification.category if entry.classification else None
    confidence = entry.classification.confidence if entry.classification else None

    return EntryStatusResponse(
        entry_id=entry_id,
        job_id=str(job.id) if job else None,
        status=job.status.value if job else "unknown",
        step=job.step if job else None,
        transcript=entry.transcript,
        category=category,
        confidence=confidence,
    )


@router.get("/", response_model=EntryListResponse)
async def list_entries(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Paginated list of the authenticated user's entries. Never returns other users' data."""
    total_result = await db.execute(
        select(func.count(Entry.id)).where(Entry.user_id == current_user.id)
    )
    total = total_result.scalar()

    result = await db.execute(
        select(Entry)
        .where(Entry.user_id == current_user.id)
        .order_by(Entry.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    entries = result.scalars().all()

    items = [
        EntryItem(
            id=str(e.id),
            transcript=e.transcript,
            recorded_at=e.recorded_at.isoformat() if e.recorded_at else None,
            created_at=e.created_at.isoformat(),
            duration_seconds=e.duration_seconds,
            category=e.classification.category if e.classification else None,
            confidence=e.classification.confidence if e.classification else None,
            # raw_audio_key intentionally excluded — use GET /entries/{id}/audio
        )
        for e in entries
    ]

    return EntryListResponse(items=items, total=total, skip=skip, limit=limit)


# ── Rate limiting (simple in-memory per-user counter) ────────────────────────
# For production use slowapi with Redis backend for multi-instance consistency.

import time
from collections import defaultdict

_presign_counts: dict[int, list[float]] = defaultdict(list)
_RATE_WINDOW = 3600   # 1 hour
_RATE_LIMIT = 30      # max presigns per user per hour


def _check_presign_rate(request: Request, user_id: int) -> None:
    now = time.time()
    window_start = now - _RATE_WINDOW
    calls = _presign_counts[user_id]
    # Purge old entries
    calls[:] = [t for t in calls if t > window_start]
    if len(calls) >= _RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Presign rate limit exceeded ({_RATE_LIMIT} per hour). Try again later.",
            headers={"Retry-After": str(int(window_start + _RATE_WINDOW - now) + 1)},
        )
    calls.append(now)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _content_type_to_suffix(content_type: str) -> str:
    mapping = {
        "audio/webm": ".webm",
        "audio/wav": ".wav",
        "audio/mp4": ".m4a",
        "audio/ogg": ".ogg",
        "audio/mpeg": ".mp3",
    }
    base = content_type.split(";")[0].strip().lower()
    return mapping.get(base, ".webm")
