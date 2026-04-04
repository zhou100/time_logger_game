"""
/api/v1/entries — Two-phase upload flow + audit endpoint.

Phase 1: POST /entries/presign
  → client receives a presigned PUT URL and an entry_id
  → client uploads audio directly to object storage (never transits the app server)

Phase 2: POST /entries/{id}/submit
  → app creates the Entry row and enqueues a processing job
  → client receives job_id for status polling / Realtime

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
from pydantic import BaseModel, field_validator
from sqlalchemy import select, func, or_, and_, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...db import get_db
from ...models.classification import EntryClassification
from ...models.entry import Entry
from ...models.user import User
from ...models.jobs import Job, JobStatus
from ...models.audit_result import AuditResult
from ...services import queue as queue_svc
from ...services import storage as storage_svc
from ...settings import settings
from ...services.categorization import categorize_text
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
    local_date: Optional[str] = None        # YYYY-MM-DD in user's local timezone


class SubmitResponse(BaseModel):
    entry_id: str
    job_id: str


VALID_CATEGORIES = {"EARNING", "LEARNING", "RELAXING", "FAMILY", "TODO", "IDEA", "THOUGHT", "TIME_RECORD"}

# Activity categories count toward time breakdown; capture categories are follow-up items
ACTIVITY_CATEGORIES = {"EARNING", "LEARNING", "RELAXING", "FAMILY", "TIME_RECORD"}
CAPTURE_CATEGORIES = {"TODO", "IDEA", "THOUGHT"}


class CategoryItem(BaseModel):
    text: Optional[str]
    category: str
    estimated_minutes: Optional[int] = None

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError(f"category must be one of {VALID_CATEGORIES}")
        return v

    @field_validator("estimated_minutes")
    @classmethod
    def validate_minutes(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (0 <= v <= 1440):
            raise ValueError("estimated_minutes must be 0-1440")
        return v


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
    activity_breakdown: Optional[Dict[str, float]] = None
    capture_counts: Optional[Dict[str, int]] = None


class EntryUpdateRequest(BaseModel):
    transcript: Optional[str] = None
    categories: Optional[List[CategoryItem]] = None
    date: Optional[str] = None  # YYYY-MM-DD — moves entry to this day


class AuditRequest(BaseModel):
    date: str   # YYYY-MM-DD (UTC)
    regenerate: bool = False  # force re-generation even if cached


class AuditResponse(BaseModel):
    entries: int
    breakdown: Dict[str, float]
    approximate: bool = False  # True if some estimated_minutes were null (filled with avg)
    audit_text: Optional[str]
    generated_at: Optional[str]
    cached: bool = False
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

    # Compute local_date: prefer explicit value, fallback to recorded_at date, then UTC today
    if body.local_date:
        try:
            entry_local_date = datetime.strptime(body.local_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid local_date format, use YYYY-MM-DD")
    elif body.recorded_at:
        entry_local_date = body.recorded_at.date()
    else:
        entry_local_date = datetime.now(timezone.utc).date()

    entry = Entry(
        id=entry_uuid,
        user_id=current_user.id,
        raw_audio_key=body.audio_key,
        recorded_at=body.recorded_at,
        duration_seconds=body.duration_seconds,
        local_date=entry_local_date,
    )
    db.add(entry)
    await db.flush()

    # Invalidate cached audits for this local date (new entry may change breakdown)
    stale_result = await db.execute(
        select(AuditResult).where(
            AuditResult.user_id == current_user.id,
            AuditResult.audit_date == entry_local_date,
            AuditResult.is_stale.is_(False),
        )
    )
    for ar in stale_result.scalars().all():
        ar.is_stale = True

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
            CategoryItem(text=c.extracted_text, category=c.category, estimated_minutes=c.estimated_minutes)
            for c in entry.classifications
        ],
    )


@router.get("/active-dates", response_model=List[str])
async def get_active_dates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return sorted list of YYYY-MM-DD dates on which the user has entries."""
    effective_date = func.coalesce(Entry.local_date, func.date(Entry.created_at))
    result = await db.execute(
        select(effective_date.label("d"))
        .join(Job, Job.entry_id == Entry.id)
        .where(
            Entry.user_id == current_user.id,
            Job.status != JobStatus.FAILED,
        )
        .group_by(effective_date)
        .order_by(effective_date.desc())
    )
    return [str(row[0]) for row in result.all()]


@router.get("/", response_model=EntryListResponse)
async def list_entries(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    date: Optional[str] = Query(None, description="Filter by local date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Paginated list of the user's entries, newest first. Optionally filter by date."""
    base_filters = [Entry.user_id == current_user.id, Job.status != JobStatus.FAILED]

    # Optional date filter (uses local_date column)
    if date:
        try:
            filter_date = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")
        base_filters.append(_date_match(filter_date))

    total_result = await db.execute(
        select(func.count(Entry.id)).join(Job, Job.entry_id == Entry.id).where(*base_filters)
    )
    total = total_result.scalar()

    result = await db.execute(
        select(Entry)
        .join(Job, Job.entry_id == Entry.id)
        .options(selectinload(Entry.classifications))
        .where(*base_filters)
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
                CategoryItem(text=c.extracted_text, category=c.category, estimated_minutes=c.estimated_minutes)
                for c in e.classifications
            ],
        )
        for e in entries
    ]

    # Compute server-side breakdown when date filter is present (avoids pagination truncation)
    activity_breakdown = None
    capture_counts = None
    if date and entries:
        # Fetch ALL classifications for this user+date (not paginated)
        all_cls_result = await db.execute(
            select(EntryClassification)
            .join(Entry, EntryClassification.entry_id == Entry.id)
            .join(Job, Job.entry_id == Entry.id)
            .where(
                Entry.user_id == current_user.id,
                _date_match(filter_date),
                Job.status != JobStatus.FAILED,
            )
        )
        all_classifications = all_cls_result.scalars().all()
        activity_breakdown, _ = _compute_activity_breakdown(all_classifications)
        capture_counts = _compute_capture_counts(all_classifications)

    return EntryListResponse(
        items=items, total=total, skip=skip, limit=limit,
        activity_breakdown=activity_breakdown, capture_counts=capture_counts,
    )


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

    if body.date is not None:
        try:
            target_dt = datetime.strptime(body.date, "%Y-%m-%d").replace(
                hour=12, minute=0, second=0, microsecond=0, tzinfo=timezone.utc
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")
        entry.created_at = target_dt
        entry.recorded_at = target_dt

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
                    estimated_minutes=cat_item.estimated_minutes,
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
            CategoryItem(text=c.extracted_text, category=c.category, estimated_minutes=c.estimated_minutes)
            for c in entry.classifications
        ],
    )


@router.post("/{entry_id}/reclassify", response_model=EntryItem)
async def reclassify_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-run AI categorization on an entry's transcript."""
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

    # Use edited classification texts if available, fall back to original transcript
    if entry.classifications:
        text_to_classify = ". ".join(
            c.extracted_text for c in sorted(entry.classifications, key=lambda c: c.display_order)
            if c.extracted_text
        )
    else:
        text_to_classify = entry.transcript

    if not text_to_classify or not text_to_classify.strip():
        raise HTTPException(status_code=400, detail="Entry has no text to classify")

    # Run AI categorization
    cat_results = await categorize_text(text_to_classify)

    # Remove existing classifications
    for c in list(entry.classifications):
        await db.delete(c)
    await db.flush()

    # Insert new ones
    for i, item in enumerate(cat_results):
        est_min = item.get("estimated_minutes")
        try:
            est_min_val = int(est_min) if est_min is not None else None
            if est_min_val is not None and not (0 <= est_min_val <= 1440):
                est_min_val = None
        except (ValueError, TypeError):
            est_min_val = None
        entry.classifications.append(
            EntryClassification(
                entry_id=entry.id,
                category=item["category"],
                extracted_text=item.get("text"),
                estimated_minutes=est_min_val,
                display_order=i,
                model_version="gpt-5.4-nano",
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
            CategoryItem(text=c.extracted_text, category=c.category, estimated_minutes=c.estimated_minutes)
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
    - Persisted: returns cached result if fresh; set regenerate=true to force re-generation.
    - Invalidated automatically when new entries arrive for the same date.
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

    # ── Check cache ──────────────────────────────────────────────────────────
    if not body.regenerate:
        cached = await _get_cached_audit(db, current_user.id, target_date, "daily")
        if cached is not None:
            return cached

    # ── Fetch entries for the UTC day ────────────────────────────────────────
    entries, all_classifications = await _fetch_entries_for_date(
        db, current_user.id, target_date
    )

    if not entries:
        return AuditResponse(
            entries=0, breakdown={}, approximate=False,
            audit_text=None, generated_at=None, message="Record your day first",
        )

    breakdown, approximate = _compute_breakdown(all_classifications)

    # ── Generate audit text ──────────────────────────────────────────────────
    audit_text = await _generate_audit_text(entries, all_classifications, breakdown)

    now_iso = datetime.now(timezone.utc).isoformat()

    # ── Persist result ───────────────────────────────────────────────────────
    await _save_audit(
        db, current_user.id, target_date, "daily",
        len(entries), breakdown, audit_text,
    )

    return AuditResponse(
        entries=len(entries),
        breakdown=breakdown,
        approximate=approximate,
        audit_text=audit_text,
        generated_at=now_iso,
    )


class WeeklyAuditRequest(BaseModel):
    regenerate: bool = False


@router.post("/audit/weekly", response_model=AuditResponse)
async def generate_weekly_audit(
    body: WeeklyAuditRequest = WeeklyAuditRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate an opinionated weekly AI Coach letter.

    Aggregates entries from the past 7 days, compares days, identifies patterns.
    User-initiated only (button click). Persisted with audit_type="weekly".
    """
    today_utc = datetime.now(timezone.utc).date()

    # Check cache
    if not body.regenerate:
        cached = await _get_cached_audit(db, current_user.id, today_utc, "weekly")
        if cached is not None:
            return cached

    # Fetch entries for the past 7 days
    week_start_date = today_utc - timedelta(days=6)

    result = await db.execute(
        select(Entry)
        .join(Job, Job.entry_id == Entry.id)
        .options(selectinload(Entry.classifications))
        .where(
            Entry.user_id == current_user.id,
            func.coalesce(Entry.local_date, func.date(Entry.created_at)) >= week_start_date,
            func.coalesce(Entry.local_date, func.date(Entry.created_at)) <= today_utc,
            Job.status == JobStatus.DONE,
        )
        .order_by(Entry.created_at.asc())
    )
    entries = result.scalars().all()

    if not entries:
        return AuditResponse(
            entries=0, breakdown={}, approximate=False,
            audit_text=None, generated_at=None,
            message="No entries recorded this week.",
        )

    all_classifications = [c for e in entries for c in e.classifications]
    breakdown, approximate = _compute_breakdown(all_classifications)

    # Build per-day summary for the coach prompt
    day_summaries: Dict[str, List[str]] = {}
    for e in entries:
        day_key = e.local_date.strftime("%A %m/%d") if e.local_date else e.created_at.strftime("%A %m/%d")
        for c in e.classifications:
            text = c.extracted_text or e.transcript or ""
            mins = f" ({c.estimated_minutes}min)" if c.estimated_minutes else ""
            day_summaries.setdefault(day_key, []).append(f"  - [{c.category}]{mins} {text}")

    day_text = "\n".join(
        f"{day}:\n" + "\n".join(items)
        for day, items in day_summaries.items()
    )
    activity_breakdown, _ = _compute_activity_breakdown(all_classifications)
    capture_counts = _compute_capture_counts(all_classifications)
    activity_summary = ", ".join(f"{cat}: {pct}%" for cat, pct in activity_breakdown.items()) or "No activity entries"
    capture_summary = ", ".join(f"{count} {cat}{'s' if count > 1 else ''}" for cat, count in capture_counts.items()) or "None"

    weekly_prompt = f"""You are an opinionated, honest AI time coach writing a weekly review letter.

Based ONLY on the activities listed below, write a personal weekly review (3-4 paragraphs, under 400 words) that:
- Compares how different days were spent — highlight the best and worst days
- Identifies patterns (e.g. "You front-loaded creative work Mon-Tue but spent Thu-Fri in meetings")
- Says the uncomfortable truth if the data shows it (e.g. "You spent 60% of your week in meetings despite saying deep work is your priority")
- Ends with one specific, actionable change for next week

Frame your analysis using Naval's time framework:
- EARNING = making money (work, meetings, clients)
- LEARNING = building knowledge (reading, courses, practice)
- RELAXING = recharging (exercise, rest, hobbies)
- FAMILY = relationships (partner, kids, parents)
Point out the balance or imbalance across the week. If one category dominates or is missing, call it out.

Tone: direct, slightly provocative, like a coach who respects you enough to be honest.
IMPORTANT: Respond in the same language as the activities. If they are in Chinese, write in Chinese. If in English, write in English. Never mix up languages (e.g. do NOT respond in Japanese to Chinese entries).
Reference ONLY the activities listed. Do not invent activities.

Weekly activity breakdown: {activity_summary}
Weekly follow-up items: {capture_summary}

Daily activities:
{day_text}"""

    try:
        response = await asyncio.wait_for(
            _get_openai().chat.completions.create(
                model="gpt-5.4-nano",
                messages=[{"role": "user", "content": weekly_prompt}],
                temperature=0.7,
            ),
            timeout=20.0,
        )
        audit_text = response.choices[0].message.content
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Weekly review timed out. Try again.")
    except Exception as exc:
        logger.error(f"Weekly audit LLM call failed: {exc}", exc_info=True)
        return AuditResponse(
            entries=len(entries), breakdown=breakdown, approximate=approximate,
            audit_text=None, generated_at=None, message="Weekly review generation failed",
        )

    now_iso = datetime.now(timezone.utc).isoformat()

    await _save_audit(
        db, current_user.id, today_utc, "weekly",
        len(entries), breakdown, audit_text,
    )

    return AuditResponse(
        entries=len(entries),
        breakdown=breakdown,
        approximate=approximate,
        audit_text=audit_text,
        generated_at=now_iso,
    )


class WeeklyAuditHistoryItem(BaseModel):
    audit_date: str
    entries: int
    breakdown: Dict[str, float]
    audit_text: Optional[str]
    generated_at: Optional[str]
    week_label: str  # e.g. "Week of Mar 23, 2026"


@router.get("/audit/weekly/history", response_model=List[WeeklyAuditHistoryItem])
async def get_weekly_audit_history(
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return past weekly audit results for the current user, newest first."""
    result = await db.execute(
        select(AuditResult)
        .where(
            AuditResult.user_id == current_user.id,
            AuditResult.audit_type == "weekly",
            AuditResult.is_stale.is_(False),
            AuditResult.audit_text.isnot(None),
        )
        .order_by(AuditResult.audit_date.desc())
        .limit(limit)
    )
    audits = result.scalars().all()

    items = []
    for a in audits:
        # Week ran from (audit_date - 6 days) through audit_date
        week_start = a.audit_date - timedelta(days=6)
        week_label = f"Week of {week_start.strftime('%b %d, %Y')}"
        breakdown = json.loads(a.breakdown_json) if a.breakdown_json else {}
        items.append(WeeklyAuditHistoryItem(
            audit_date=a.audit_date.isoformat(),
            entries=a.entries_count,
            breakdown=breakdown,
            audit_text=a.audit_text,
            generated_at=a.generated_at.isoformat() if a.generated_at else None,
            week_label=week_label,
        ))

    return items


# ── Audit helpers ─────────────────────────────────────────────────────────────

async def _fetch_entries_for_date(
    db: AsyncSession, user_id: int, target_date
) -> tuple:
    """Fetch processed entries for a local date. Returns (entries, all_classifications)."""
    result = await db.execute(
        select(Entry)
        .join(Job, Job.entry_id == Entry.id)
        .options(selectinload(Entry.classifications))
        .where(
            Entry.user_id == user_id,
            _date_match(target_date),
            Job.status == JobStatus.DONE,
        )
        .order_by(Entry.created_at.asc())
    )
    entries = result.scalars().all()
    all_classifications = [c for e in entries for c in e.classifications]
    return entries, all_classifications


def _compute_breakdown(
    all_classifications: list,
) -> tuple[Dict[str, float], bool]:
    """Time-weighted breakdown (all categories). Returns (breakdown_dict, approximate_flag)."""
    if not all_classifications:
        return {}, False

    has_any = any(c.estimated_minutes is not None for c in all_classifications)
    has_all = all(c.estimated_minutes is not None for c in all_classifications)

    weights: Dict[str, float] = {}
    if has_any:
        non_null = [c.estimated_minutes for c in all_classifications if c.estimated_minutes is not None]
        avg = sum(non_null) / len(non_null) if non_null else 1
        for c in all_classifications:
            w = float(c.estimated_minutes) if c.estimated_minutes is not None else avg
            weights[c.category] = weights.get(c.category, 0) + w
    else:
        for c in all_classifications:
            weights[c.category] = weights.get(c.category, 0) + 1

    total = sum(weights.values()) or 1
    breakdown = {cat: round(w / total * 100, 1) for cat, w in weights.items()}
    return breakdown, not has_all


def _compute_activity_breakdown(
    all_classifications: list,
) -> tuple[Dict[str, float], bool]:
    """Time-weighted breakdown of activity categories only (EARNING/LEARNING/RELAXING/FAMILY/TIME_RECORD)."""
    activity_cls = [c for c in all_classifications if c.category in ACTIVITY_CATEGORIES]
    return _compute_breakdown(activity_cls)


def _compute_capture_counts(
    all_classifications: list,
) -> Dict[str, int]:
    """Simple counts of capture categories (TODO/IDEA/THOUGHT)."""
    counts: Dict[str, int] = {}
    for c in all_classifications:
        if c.category in CAPTURE_CATEGORIES:
            counts[c.category] = counts.get(c.category, 0) + 1
    return counts


async def _generate_audit_text(
    entries: list, all_classifications: list, breakdown: Dict[str, float],
) -> Optional[str]:
    """Call GPT to generate audit text. Returns None on failure."""
    entry_lines = []
    for e in entries:
        for c in e.classifications:
            text = c.extracted_text or e.transcript or ""
            mins = f" ({c.estimated_minutes}min)" if c.estimated_minutes else ""
            entry_lines.append(f"- [{c.category}]{mins} {text}")

    activity_breakdown, _ = _compute_activity_breakdown(all_classifications)
    capture_counts = _compute_capture_counts(all_classifications)

    activity_summary = ", ".join(f"{cat}: {pct}%" for cat, pct in activity_breakdown.items()) or "No activity entries"
    capture_summary = ", ".join(f"{count} {cat}{'s' if count > 1 else ''}" for cat, count in capture_counts.items()) or "None"
    entry_summary = "\n".join(entry_lines)

    audit_prompt = f"""You are an honest, direct AI time coach. Based ONLY on the \
activities listed below, write a short audit (2-3 paragraphs, under 300 words) that:
- Summarizes how the day was actually spent
- Calls out what the numbers reveal (e.g. blocked time, admin overhead, shallow work)
- Gives one specific, actionable insight

Frame your analysis using Naval's time framework:
- EARNING = making money (work, meetings, clients)
- LEARNING = building knowledge (reading, courses, practice)
- RELAXING = recharging (exercise, rest, hobbies)
- FAMILY = relationships (partner, kids, parents)
Point out the balance or imbalance. If one category dominates or is missing, call it out.

IMPORTANT: Respond in the same language as the activities. If they are in Chinese, write in Chinese. If in English, write in English. Never mix up languages (e.g. do NOT respond in Japanese to Chinese entries).
Reference ONLY the activities listed. Do not invent activities not mentioned.

Activity breakdown: {activity_summary}
Follow-up items: {capture_summary}

Activities recorded today:
{entry_summary}"""

    try:
        response = await asyncio.wait_for(
            _get_openai().chat.completions.create(
                model="gpt-5.4-nano",
                messages=[{"role": "user", "content": audit_prompt}],
                temperature=0.7,
            ),
            timeout=15.0,
        )
        return response.choices[0].message.content
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Audit generation timed out. Try again.")
    except Exception as exc:
        logger.error(f"Audit LLM call failed: {exc}", exc_info=True)
        return None


async def _get_cached_audit(
    db: AsyncSession, user_id: int, audit_date, audit_type: str,
) -> Optional[AuditResponse]:
    """Return cached AuditResponse if fresh, else None."""
    result = await db.execute(
        select(AuditResult).where(
            AuditResult.user_id == user_id,
            AuditResult.audit_date == audit_date,
            AuditResult.audit_type == audit_type,
            AuditResult.is_stale.is_(False),
        ).order_by(AuditResult.generated_at.desc()).limit(1)
    )
    cached = result.scalar_one_or_none()
    if not cached or not cached.audit_text:
        return None

    breakdown = json.loads(cached.breakdown_json) if cached.breakdown_json else {}
    return AuditResponse(
        entries=cached.entries_count,
        breakdown=breakdown,
        approximate=False,
        audit_text=cached.audit_text,
        generated_at=cached.generated_at.isoformat() if cached.generated_at else None,
        cached=True,
    )


async def _save_audit(
    db: AsyncSession, user_id: int, audit_date, audit_type: str,
    entries_count: int, breakdown: Dict[str, float], audit_text: Optional[str],
) -> None:
    """Persist an audit result, replacing any previous for the same user+date+type."""
    # Mark old results stale
    old = await db.execute(
        select(AuditResult).where(
            AuditResult.user_id == user_id,
            AuditResult.audit_date == audit_date,
            AuditResult.audit_type == audit_type,
        )
    )
    for r in old.scalars().all():
        r.is_stale = True

    db.add(AuditResult(
        user_id=user_id,
        audit_date=audit_date,
        audit_type=audit_type,
        entries_count=entries_count,
        breakdown_json=json.dumps(breakdown),
        audit_text=audit_text,
    ))
    await db.flush()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _date_match(target_date):
    """Match entries by local_date, falling back to DATE(created_at) for old rows with NULL local_date."""
    return or_(
        Entry.local_date == target_date,
        and_(Entry.local_date.is_(None), func.date(Entry.created_at) == target_date),
    )


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
