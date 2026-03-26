"""
/api/v1/entries — Two-phase upload flow + audit endpoint.

Phase 1: POST /entries/presign
  → client receives a presigned PUT URL and an entry_id
  → client uploads audio directly to MinIO (never transits the app server)

Phase 2: POST /entries/{id}/submit
  → app creates the Entry row and enqueues a processing job
  → client receives job_id for status polling / WebSocket

Status polling: GET /entries/{id}/status
Listing:        GET /entries/
Audit:          POST /entries/audit
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from openai import AsyncOpenAI
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...db import get_db
from ...models.classification import EntryClassification
from ...models.entry import Entry
from ...models.user import User
from ...models.jobs import Job, JobStatus
from ...services import queue as queue_svc
from ...services import storage as storage_svc
from ...settings import settings
from ...utils.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/entries", tags=["entries"])

_openai: AsyncOpenAI | None = None


def _get_openai() -> AsyncOpenAI:
    global _openai
    if _openai is None:
        _openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _openai


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


class CategoryItem(BaseModel):
    text: Optional[str]
    category: str


class EntryStatusResponse(BaseModel):
    entry_id: str
    job_id: Optional[str]
    status: str       # pending | processing | done | failed | unknown
    step: Optional[str]
    transcript: Optional[str]
    categories: List[CategoryItem]


class EntryItem(BaseModel):
    id: str
    transcript: Optional[str]
    recorded_at: Optional[str]
    created_at: str
    duration_seconds: Optional[int]
    categories: List[CategoryItem]


class EntryListResponse(BaseModel):
    items: List[EntryItem]
    total: int
    skip: int
    limit: int


class EntryUpdateRequest(BaseModel):
    transcript: Optional[str] = None
    categories: Optional[List[CategoryItem]] = None


class AuditRequest(BaseModel):
    date: str   # YYYY-MM-DD (UTC)


class AuditResponse(BaseModel):
    entries: int
    breakdown: Dict[str, float]
    audit_text: Optional[str]
    generated_at: Optional[str]
    message: Optional[str] = None


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
        select(Entry)
        .options(selectinload(Entry.classifications))
        .where(Entry.id == entry_uuid, Entry.user_id == current_user.id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    job = await queue_svc.get_job_for_entry(db, entry_uuid)

    return EntryStatusResponse(
        entry_id=entry_id,
        job_id=str(job.id) if job else None,
        status=job.status.value if job else "unknown",
        step=job.step if job else None,
        transcript=entry.transcript,
        categories=[
            CategoryItem(text=c.extracted_text, category=c.category)
            for c in entry.classifications
        ],
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
        select(func.count(Entry.id)).join(Job, Job.entry_id == Entry.id).where(Entry.user_id == current_user.id, Job.status != JobStatus.FAILED)
    )
    total = total_result.scalar()

    result = await db.execute(
        select(Entry)
        .join(Job, Job.entry_id == Entry.id)
        .options(selectinload(Entry.classifications))
        .where(Entry.user_id == current_user.id, Job.status != JobStatus.FAILED)
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
            categories=[
                CategoryItem(text=c.extracted_text, category=c.category)
                for c in e.classifications
            ],
        )
        for e in entries
    ]

    return EntryListResponse(items=items, total=total, skip=skip, limit=limit)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an entry and its associated audio, classifications, and jobs."""
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

    # Delete audio from object storage (best-effort)
    if entry.raw_audio_key:
        try:
            await storage_svc.delete_object(entry.raw_audio_key)
        except Exception as exc:
            logger.warning(f"Failed to delete audio {entry.raw_audio_key}: {exc}")

    await db.delete(entry)  # cascades to classifications, jobs, metadata
    await db.commit()
    logger.info(f"Deleted entry {entry_id} for user {current_user.id}")


@router.patch("/{entry_id}", response_model=EntryItem)
async def update_entry(
    entry_id: str,
    body: EntryUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an entry's transcript and/or categories."""
    try:
        entry_uuid = uuid.UUID(entry_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid entry_id")

    result = await db.execute(
        select(Entry)
        .options(selectinload(Entry.classifications))
        .where(Entry.id == entry_uuid, Entry.user_id == current_user.id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    if body.transcript is not None:
        entry.transcript = body.transcript

    if body.categories is not None:
        # Remove existing classifications
        for c in list(entry.classifications):
            await db.delete(c)
        await db.flush()

        # Insert new ones
        for i, cat_item in enumerate(body.categories):
            entry.classifications.append(
                EntryClassification(
                    entry_id=entry.id,
                    category=cat_item.category,
                    extracted_text=cat_item.text,
                    display_order=i,
                    user_override=True,
                )
            )

    await db.commit()
    await db.refresh(entry, ["classifications"])

    return EntryItem(
        id=str(entry.id),
        transcript=entry.transcript,
        recorded_at=entry.recorded_at.isoformat() if entry.recorded_at else None,
        created_at=entry.created_at.isoformat(),
        duration_seconds=entry.duration_seconds,
        categories=[
            CategoryItem(text=c.extracted_text, category=c.category)
            for c in entry.classifications
        ],
    )


@router.post("/audit", response_model=AuditResponse)
async def generate_audit(
    body: AuditRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate an AI-powered time audit for a given UTC date.

    - Accepts today and up to the last 7 days; rejects future dates and older dates.
    - Breakdown denominator is EntryClassification rows, not Entry rows.
    - Calls GPT-4o-mini with a 15-second timeout.
    - Results are NOT persisted; re-generate on each click.
    """
    # ── Validate date ────────────────────────────────────────────────────────
    try:
        target_date = datetime.strptime(body.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    today_utc = datetime.now(timezone.utc).date()
    if target_date > today_utc:
        raise HTTPException(status_code=400, detail="Date cannot be in the future.")
    if target_date < today_utc - timedelta(days=7):
        raise HTTPException(status_code=400, detail="Date must be within the last 7 days.")

    # ── Fetch entries for the UTC day ────────────────────────────────────────
    day_start = datetime(target_date.year, target_date.month, target_date.day,
                         tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)

    result = await db.execute(
        select(Entry)
        .join(Job, Job.entry_id == Entry.id)
        .options(selectinload(Entry.classifications))
        .where(
            Entry.user_id == current_user.id,
            Entry.created_at >= day_start,
            Entry.created_at < day_end,
            Job.status == JobStatus.DONE,
        )
        .order_by(Entry.created_at.asc())
    )
    entries = result.scalars().all()

    # ── Empty state ──────────────────────────────────────────────────────────
    if not entries:
        return AuditResponse(
            entries=0,
            breakdown={},
            audit_text=None,
            generated_at=None,
            message="Record your day first",
        )

    # ── Breakdown (denominator = classification rows, not entry rows) ────────
    all_classifications = [c for e in entries for c in e.classifications]
    total_classifications = len(all_classifications)

    category_counts: Dict[str, int] = {}
    for c in all_classifications:
        category_counts[c.category] = category_counts.get(c.category, 0) + 1

    breakdown = {
        cat: round(count / total_classifications * 100, 1)
        for cat, count in category_counts.items()
    }

    # ── Build entry summary for GPT prompt ──────────────────────────────────
    entry_lines = []
    for e in entries:
        for c in e.classifications:
            text = c.extracted_text or e.transcript or ""
            entry_lines.append(f"- [{c.category}] {text}")

    breakdown_summary = ", ".join(f"{cat}: {pct}%" for cat, pct in breakdown.items())
    entry_summary = "\n".join(entry_lines)

    audit_prompt = f"""You are an honest, direct AI time coach. Based ONLY on the \
activities listed below, write a short audit (2-3 paragraphs, under 300 words) that:
- Summarizes how the day was actually spent
- Calls out what the numbers reveal (e.g. blocked time, admin overhead, shallow work)
- Gives one specific, actionable insight

Reference ONLY the activities listed. Do not invent activities not mentioned.

Category breakdown: {breakdown_summary}

Activities recorded today:
{entry_summary}"""

    # ── Call GPT-4o-mini with 15-second timeout ──────────────────────────────
    try:
        response = await asyncio.wait_for(
            _get_openai().chat.completions.create(
                model="gpt-5.4-nano",
                messages=[{"role": "user", "content": audit_prompt}],
                temperature=0.7,
            ),
            timeout=15.0,
        )
        audit_text = response.choices[0].message.content
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Audit generation timed out. Try again.",
        )
    except Exception as exc:
        logger.error(f"Audit LLM call failed: {exc}", exc_info=True)
        return AuditResponse(
            entries=len(entries),
            breakdown=breakdown,
            audit_text=None,
            generated_at=None,
            message="Audit generation failed",
        )

    return AuditResponse(
        entries=len(entries),
        breakdown=breakdown,
        audit_text=audit_text,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


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
