"""
/api/v1/entries — Two-phase upload flow.

Phase 1: POST /entries/presign
  → client receives a presigned PUT URL and an entry_id
  → client uploads audio directly to MinIO (never transits the app server)

Phase 2: POST /entries/{id}/submit
  → app creates the Entry row and enqueues a processing job
  → client receives job_id for status polling / WebSocket

Status polling: GET /entries/{id}/status
Listing:        GET /entries/
"""
import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from ...models.entry import Entry
from ...models.user import User
from ...db import get_db
from ...utils.auth import get_current_user
from ...services import storage as storage_svc
from ...services import queue as queue_svc
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/entries", tags=["entries"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class PresignResponse(BaseModel):
    entry_id: str
    upload_url: str
    audio_key: str


class SubmitRequest(BaseModel):
    audio_key: str                          # must match the key from presign
    recorded_at: Optional[datetime] = None  # client-side timestamp
    duration_seconds: Optional[int] = None


class SubmitResponse(BaseModel):
    entry_id: str
    job_id: str


class EntryStatusResponse(BaseModel):
    entry_id: str
    job_id: Optional[str]
    status: str       # pending | processing | done | failed | unknown
    step: Optional[str]
    transcript: Optional[str]
    category: Optional[str]
    confidence: Optional[float]


class EntryItem(BaseModel):
    id: str
    transcript: Optional[str]
    recorded_at: Optional[str]
    created_at: str
    duration_seconds: Optional[int]
    category: Optional[str]
    confidence: Optional[float]


class EntryListResponse(BaseModel):
    items: List[EntryItem]
    total: int
    skip: int
    limit: int


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/presign", response_model=PresignResponse)
async def presign_upload(
    content_type: str = "audio/webm",
    current_user: User = Depends(get_current_user),
):
    """
    Generate a presigned PUT URL for direct client-to-storage audio upload.
    The client should PUT the audio file to upload_url, then call /submit.
    """
    entry_id = str(uuid.uuid4())
    suffix = _content_type_to_suffix(content_type)
    audio_key = storage_svc.make_audio_key(current_user.id, entry_id, suffix)
    upload_url = await storage_svc.generate_presigned_put(audio_key, content_type)
    return PresignResponse(entry_id=entry_id, upload_url=upload_url, audio_key=audio_key)


@router.post("/{entry_id}/submit", response_model=SubmitResponse)
async def submit_entry(
    entry_id: str,
    body: SubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Register the entry and enqueue it for async processing.
    Call this after the client has successfully PUT audio to the presign URL.
    """
    try:
        entry_uuid = uuid.UUID(entry_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid entry_id")

    # Verify the audio_key belongs to this user
    expected_prefix = f"audio/{current_user.id}/"
    if not body.audio_key.startswith(expected_prefix):
        raise HTTPException(status_code=400, detail="audio_key does not match user")

    entry = Entry(
        id=entry_uuid,
        user_id=current_user.id,
        raw_audio_key=body.audio_key,
        recorded_at=body.recorded_at,
        duration_seconds=body.duration_seconds,
    )
    db.add(entry)
    await db.flush()

    job = await queue_svc.enqueue(db, entry_uuid, current_user.id)
    await db.commit()

    logger.info(f"Entry {entry_id} submitted, job {job.id} enqueued")
    return SubmitResponse(entry_id=entry_id, job_id=str(job.id))


@router.get("/{entry_id}/status", response_model=EntryStatusResponse)
async def get_entry_status(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Poll the processing status of an entry."""
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
    """Paginated list of the user's entries, newest first."""
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
        )
        for e in entries
    ]

    return EntryListResponse(items=items, total=total, skip=skip, limit=limit)


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
