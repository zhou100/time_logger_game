"""
/v1/public/demo — anonymous demo pipeline (no auth).

All four endpoints are gated on `settings.PUBLIC_DEMO_ENABLED`: when the flag
is off, every route returns 404 so the landing page cleanly falls back to the
fake-output path with no backend cost.

Lifecycle (happy path):
    1. User solves Turnstile in the browser.
    2. POST /verify-turnstile  → Cloudflare siteverify → issue permit_token
       (HMAC over session_id, exp, uses_remaining) + HttpOnly session cookie.
    3. POST /presign           → verify permit, validate MIME, create Entry
       placeholder row (user_id=NULL, demo_session_id, expires_at=now+24h),
       return S3 presigned PUT URL, updated permit_token, and a claim_token
       that survives OAuth redirect.
    4. Client PUTs audio straight to object storage.
    5. POST /submit            → verify permit + cookie match entry; read-only
       cost-cap check; if under cap, enqueue job for existing worker; if at/
       over cap, return pre-baked "capped" payload without enqueuing.
    6. GET /status/{entry_id}  → polled by the client; reads Job.step +
       classifications + EntryMetadata("demo_teaser"), synthesizes a
       mechanical summary from classifications at read-time (never stored).

Security posture:
    - tlg_demo_sid cookie is HttpOnly + SameSite=Lax + Secure. The session_id
      cannot be lifted via JS/XSS.
    - permit_token ties presign/submit to the exact session_id stamped in the
      cookie. Spoofing one without the other is rejected.
    - Rate limits are keyed on hashed IP / hashed session. Raw IP never
      touches a log or a DB row.
    - Demo requests skip Notification writes in the worker (item 4 glue) and
      debit the actual OpenAI spend into demo_cost_counter under SELECT FOR
      UPDATE to bound the daily cost.
"""
from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models.classification import EntryClassification
from ..models.demo import (
    DEMO_TEASER_METADATA_KEY,
    DemoCostCounter,
    DemoOutcome,
    DemoRequestLog,
)
from ..models.entry import Entry
from ..models.entry_metadata import EntryMetadata
from ..models.jobs import Job, JobStatus
from ..services import analytics as analytics_svc
from ..services import metrics as metrics_svc
from ..services import queue as queue_svc
from ..services import storage as storage_svc
from ..services.demo_ip import extract_hashed_ip
from ..settings import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/public/demo", tags=["public-demo"])


# ── Constants ─────────────────────────────────────────────────────────────────

SESSION_COOKIE = "tlg_demo_sid"
SESSION_COOKIE_MAX_AGE = 60 * 60 * 24  # 24h — matches demo entry TTL

PERMIT_TTL = timedelta(hours=1)
PERMIT_INITIAL_USES = 5

DEMO_ENTRY_TTL = timedelta(hours=24)
CLAIM_TOKEN_TTL = timedelta(hours=24)

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

ALLOWED_AUDIO_CONTENT_TYPES: Dict[str, str] = {
    "audio/webm": ".webm",
    "audio/mp4": ".mp4",
    "audio/m4a": ".m4a",
    "audio/mpeg": ".mp3",
}

# Pre-baked fallback output returned when the daily OpenAI cost cap is hit.
# Kept in code (not DB) so a new deploy automatically ships any copy tweak.
FAKE_CAPPED_OUTPUT = {
    "summary": "A calm day with focused time and a couple of open threads.",
    "key_points": [
        "Progress felt steady without being dramatic.",
        "One conversation still needs to happen.",
    ],
    "todos": [
        "Send the note you were putting off.",
        "Block 25 minutes tomorrow for deep work.",
    ],
}


# ── Rate-limit configuration ──────────────────────────────────────────────────
# Three independent in-process counters. Each stores a deque of event
# timestamps per key and trims on lookup. These only need to bound abuse at
# the single-instance level — Cloudflare rate-limits are the first line of
# defence for the real Internet.

from collections import defaultdict, deque
from threading import Lock

_RATE_LOCK = Lock()
_RATE_BUCKETS: Dict[str, Dict[str, deque]] = defaultdict(lambda: defaultdict(deque))

# (bucket_name, window_seconds, max_events)
_RATE_RULES = {
    # Per-IP, applies to every endpoint in this router.
    "per_ip_minute": (60, 5),
    # Per-session /submit successes.
    "submit_per_session_hour": (3600, 3),
    # Per-IP /submit successes over 24h.
    "submit_per_ip_day": (86400, 10),
}


_BUCKET_LIMITER_LABELS = {
    "per_ip_minute": "per_ip_minute",
    "submit_per_session_hour": "per_session_hour",
    "submit_per_ip_day": "per_ip_day",
}


class RateLimitTripped(HTTPException):
    """Raised by _check_rate / _enforce_rate_limits with the tripped bucket.

    Subclasses HTTPException so routes that don't care about the bucket can
    just let it propagate as a 429. Submit catches it for observability.
    """

    def __init__(self, bucket: str, retry_after: int) -> None:
        super().__init__(
            status_code=429,
            detail={"error": "rate_limited", "retry_after_seconds": retry_after},
        )
        self.bucket = bucket
        self.retry_after = retry_after

    @property
    def limiter_label(self) -> str:
        return _BUCKET_LIMITER_LABELS.get(self.bucket, self.bucket)


def _check_rate(bucket: str, key: str, now: datetime) -> Tuple[bool, Optional[int]]:
    """Return (ok, retry_after_seconds)."""
    window, max_events = _RATE_RULES[bucket]
    cutoff = now.timestamp() - window
    with _RATE_LOCK:
        q = _RATE_BUCKETS[bucket][key]
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= max_events:
            retry_after = int(window - (now.timestamp() - q[0])) + 1
            return False, max(retry_after, 1)
        return True, None


def _record_rate(bucket: str, key: str, now: datetime) -> None:
    with _RATE_LOCK:
        _RATE_BUCKETS[bucket][key].append(now.timestamp())


def _reset_rate_state_for_tests() -> None:
    """Test-only: clear in-process counters between cases."""
    with _RATE_LOCK:
        _RATE_BUCKETS.clear()


def gc_rate_buckets() -> int:
    """Drop empty deques + keys whose newest event is older than the window.

    Long-running processes accumulate one-shot keys forever otherwise (each
    unique hashed_ip / session_id allocates a deque on first hit). Called
    periodically from the demo sweep loop.

    Returns the number of (bucket, key) pairs evicted.
    """
    now_ts = datetime.now(timezone.utc).timestamp()
    evicted = 0
    with _RATE_LOCK:
        for bucket_name, key_map in list(_RATE_BUCKETS.items()):
            window = _RATE_RULES[bucket_name][0]
            cutoff = now_ts - window
            for key, q in list(key_map.items()):
                while q and q[0] < cutoff:
                    q.popleft()
                if not q:
                    del key_map[key]
                    evicted += 1
    return evicted


# HMAC helpers live in services/demo_tokens — shared with /v1/entries/claim-demo-session.
from ..services.demo_tokens import (  # noqa: E402
    build_claim_token as _build_claim_token,
    build_permit_token as _build_permit_token,
    iso as _iso,
    parse_permit_token as _parse_permit_token,
)


# ── Request/response schemas ─────────────────────────────────────────────────

class VerifyTurnstileRequest(BaseModel):
    token: str


class VerifyTurnstileResponse(BaseModel):
    permit_token: str
    expires_at: str  # ISO-8601


class PresignRequest(BaseModel):
    content_type: str
    permit_token: Optional[str] = Field(
        default=None,
        description="Pass here if not supplied via X-Demo-Permit header.",
    )


class PresignResponse(BaseModel):
    entry_id: str
    upload_url: str
    content_type: str
    permit_token: str  # updated token with uses_remaining-1
    claim_token: str


class SubmitRequest(BaseModel):
    entry_id: str
    permit_token: Optional[str] = None


class SubmitResponse(BaseModel):
    entry_id: str
    job_id: Optional[str] = None
    demo: Optional[str] = None  # set to "capped" when cost-cap path
    fake_output: Optional[Dict] = None


class StatusResponse(BaseModel):
    step: str
    transcript: Optional[str]
    classifications: List[Dict]
    summary: Optional[str]
    demo_teaser: Optional[str]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _require_enabled() -> None:
    """404 every public-demo route when the flag is off."""
    if not settings.PUBLIC_DEMO_ENABLED:
        raise HTTPException(status_code=404)


def _read_permit(request: Request, body_token: Optional[str]) -> str:
    """Prefer the explicit body field; fall back to the header."""
    return body_token or request.headers.get("x-demo-permit") or ""


def _session_id_from_cookie(request: Request) -> Optional[str]:
    return request.cookies.get(SESSION_COOKIE)


async def _log_request(
    db: AsyncSession,
    *,
    hashed_ip: str,
    demo_session_id: Optional[str],
    outcome: str,
) -> None:
    """Always insert one demo_request_log row per terminal path."""
    db.add(
        DemoRequestLog(
            hashed_ip=hashed_ip,
            demo_session_id=demo_session_id,
            outcome=outcome,
        )
    )
    await db.commit()


def _enforce_rate_limits(
    request: Request,
    *,
    hashed_ip: str,
    session_id: Optional[str],
    kind: str,
) -> None:
    """Trip RateLimitTripped on any rule applicable to this request.

    submit-specific buckets only apply to /submit. The exception subclasses
    HTTPException, so routes that don't want bucket-level observability can
    simply let it propagate as a 429.
    """
    now = datetime.now(timezone.utc)
    ok, retry = _check_rate("per_ip_minute", hashed_ip, now)
    if not ok:
        raise RateLimitTripped("per_ip_minute", retry or 1)
    if kind == "submit":
        if session_id:
            ok, retry = _check_rate("submit_per_session_hour", session_id, now)
            if not ok:
                raise RateLimitTripped("submit_per_session_hour", retry or 1)
        ok, retry = _check_rate("submit_per_ip_day", hashed_ip, now)
        if not ok:
            raise RateLimitTripped("submit_per_ip_day", retry or 1)
    _record_rate("per_ip_minute", hashed_ip, now)


def _derive_mechanical_summary(rows: List[EntryClassification]) -> Optional[str]:
    """
    Build a human-readable summary from classification rows at read-time.
    No LLM call, no stored blob — the canvas fills in as the worker writes
    rows and disappears if the user edits them away.
    """
    if not rows:
        return None
    # Distinct, insertion-ordered category names. Fall back to the enum label
    # for unknowns; keep the nouns short so the summary reads as a sentence.
    seen: List[str] = []
    for r in rows:
        label = (r.category or "").strip().lower()
        if label and label not in seen:
            seen.append(label)
    top = seen[:3]
    todos = sum(1 for r in rows if (r.category or "").upper() == "TODO")
    key_points = sum(
        1
        for r in rows
        if (r.category or "").upper() in {"REFLECTION", "IDEA", "THOUGHT", "EXPERIMENT"}
    )
    if not top:
        return None
    joined = ", ".join(top)
    return (
        f"You spoke about {joined} — "
        f"{todos} todo(s), {key_points} key point(s)."
    )


async def _current_cost_usd(db: AsyncSession) -> float:
    """Read-only peek at today's demo spend. 0 if no row yet."""
    today = datetime.now(timezone.utc).date()
    result = await db.execute(
        select(DemoCostCounter.cost_usd).where(DemoCostCounter.date == today)
    )
    v = result.scalar_one_or_none()
    return float(v) if v is not None else 0.0


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/verify-turnstile", response_model=VerifyTurnstileResponse)
async def verify_turnstile(
    body: VerifyTurnstileRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    _require_enabled()
    hashed_ip = extract_hashed_ip(request)
    _enforce_rate_limits(
        request, hashed_ip=hashed_ip, session_id=None, kind="verify"
    )

    # Talk to Cloudflare. A 5-second timeout is longer than we'd like but
    # Turnstile is the gating step — we'd rather surface a 400 than 500.
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            cf = await client.post(
                TURNSTILE_VERIFY_URL,
                data={
                    "secret": settings.TURNSTILE_SECRET_KEY,
                    "response": body.token,
                },
            )
        cf_json = cf.json() if cf.status_code == 200 else {}
    except Exception as exc:  # noqa: BLE001 — any network hiccup → 400
        logger.warning(f"Turnstile verify call failed: {exc}")
        await _log_request(
            db, hashed_ip=hashed_ip, demo_session_id=None,
            outcome=DemoOutcome.TURNSTILE_FAILED,
        )
        raise HTTPException(status_code=400, detail={"error": "verification_failed"})

    if not cf_json.get("success"):
        await _log_request(
            db, hashed_ip=hashed_ip, demo_session_id=None,
            outcome=DemoOutcome.TURNSTILE_FAILED,
        )
        raise HTTPException(status_code=400, detail={"error": "verification_failed"})

    session_id = secrets.token_hex(32)  # 64 chars
    exp = datetime.now(timezone.utc) + PERMIT_TTL
    permit = _build_permit_token(session_id, exp, PERMIT_INITIAL_USES)

    # HttpOnly prevents JS/XSS from reading the session_id. Secure keeps it
    # off plaintext HTTP. SameSite=Lax allows the OAuth return navigation to
    # carry it back but blocks cross-site POST.
    response.set_cookie(
        SESSION_COOKIE,
        session_id,
        max_age=SESSION_COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
    )
    await _log_request(
        db, hashed_ip=hashed_ip, demo_session_id=session_id, outcome=DemoOutcome.OK
    )
    # Observability: server-side capture joined client-side via demo_session_id.
    analytics_svc.capture_demo_event(
        "demo_turnstile_verified",
        demo_session_id=session_id,
        properties={"cf_outcome": DemoOutcome.OK},
    )
    return VerifyTurnstileResponse(permit_token=permit, expires_at=_iso(exp))


@router.post("/presign", response_model=PresignResponse)
async def presign(
    body: PresignRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    _require_enabled()
    hashed_ip = extract_hashed_ip(request)
    cookie_session = _session_id_from_cookie(request)
    _enforce_rate_limits(
        request, hashed_ip=hashed_ip, session_id=cookie_session, kind="presign"
    )

    permit_token = _read_permit(request, body.permit_token)
    session_id, exp, uses = _parse_permit_token(permit_token)

    # Cookie must match the session the permit was issued for.
    if not cookie_session or cookie_session != session_id:
        raise HTTPException(status_code=401, detail={"error": "session_mismatch"})

    if body.content_type not in ALLOWED_AUDIO_CONTENT_TYPES:
        raise HTTPException(
            status_code=400, detail={"error": "unsupported_content_type"}
        )
    ext = ALLOWED_AUDIO_CONTENT_TYPES[body.content_type]

    entry_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    raw_audio_key = f"anonymous-demo/{session_id}/{entry_id}{ext}"
    entry = Entry(
        id=entry_id,
        user_id=None,
        demo_session_id=session_id,
        raw_audio_key=raw_audio_key,
        recorded_at=now,
        expires_at=now + DEMO_ENTRY_TTL,
    )
    db.add(entry)
    await db.flush()

    upload_url = await storage_svc.generate_presigned_put(
        raw_audio_key, body.content_type
    )

    # Decrement one use; reissue. Keep the same exp so we don't silently
    # extend the Turnstile window.
    new_permit = _build_permit_token(session_id, exp, uses - 1)
    claim_exp = now + CLAIM_TOKEN_TTL
    claim_token = _build_claim_token(session_id, claim_exp)

    await db.commit()
    return PresignResponse(
        entry_id=str(entry_id),
        upload_url=upload_url,
        content_type=body.content_type,
        permit_token=new_permit,
        claim_token=claim_token,
    )


@router.post("/submit", response_model=SubmitResponse)
async def submit(
    body: SubmitRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    _require_enabled()
    hashed_ip = extract_hashed_ip(request)
    cookie_session = _session_id_from_cookie(request)

    # /submit rate limits include the two submit-only buckets — check them
    # before doing real work so we can mark outcome=DemoOutcome.RATE_LIMITED.
    try:
        _enforce_rate_limits(
            request,
            hashed_ip=hashed_ip,
            session_id=cookie_session,
            kind="submit",
        )
    except RateLimitTripped as exc:
        limiter = exc.limiter_label
        await _log_request(
            db, hashed_ip=hashed_ip, demo_session_id=cookie_session,
            outcome=DemoOutcome.RATE_LIMITED,
        )
        analytics_svc.capture_demo_event(
            "demo_submit",
            demo_session_id=cookie_session,
            properties={"outcome": DemoOutcome.RATE_LIMITED, "limiter": limiter},
        )
        metrics_svc.demo_submit_total.labels(outcome=DemoOutcome.RATE_LIMITED).inc()
        metrics_svc.demo_rate_limited_total.labels(limiter=limiter).inc()
        raise

    permit_token = _read_permit(request, body.permit_token)
    session_id, _exp, _uses = _parse_permit_token(permit_token)
    if not cookie_session or cookie_session != session_id:
        raise HTTPException(status_code=401, detail={"error": "session_mismatch"})

    try:
        entry_uuid = uuid.UUID(body.entry_id)
    except ValueError:
        raise HTTPException(status_code=400, detail={"error": "invalid_entry_id"})

    # Scope lookup to (id, session_id, user_id IS NULL) so an authed row
    # can never be hijacked by a demo permit that happens to hold its id.
    result = await db.execute(
        select(Entry).where(
            Entry.id == entry_uuid,
            Entry.demo_session_id == session_id,
            Entry.user_id.is_(None),
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail={"error": "entry_not_found"})

    # ── Cost-cap: read-only; increment happens post-Whisper in the worker ─
    current_cost = await _current_cost_usd(db)
    if current_cost >= float(settings.DAILY_DEMO_OPENAI_USD_CAP):
        await _log_request(
            db, hashed_ip=hashed_ip, demo_session_id=session_id, outcome=DemoOutcome.CAPPED
        )
        analytics_svc.capture_demo_event(
            "demo_submit",
            demo_session_id=session_id,
            properties={
                "outcome": DemoOutcome.CAPPED,
                "hashed_ip": hashed_ip,
                "cost_usd_today": current_cost,
            },
        )
        metrics_svc.demo_submit_total.labels(outcome=DemoOutcome.CAPPED).inc()
        return SubmitResponse(
            entry_id=body.entry_id,
            demo="capped",
            fake_output=FAKE_CAPPED_OUTPUT,
        )

    job = await queue_svc.enqueue(
        db,
        entry_id=entry_uuid,
        user_id=None,
        demo_session_id=session_id,
    )
    # Record the two submit-only rate buckets on success so that subsequent
    # calls within the windows can trip 429. The check happened up top in
    # `_enforce_rate_limits`; the matching writes live here so failures
    # before this point don't count against the user.
    _now = datetime.now(timezone.utc)
    if session_id:
        _record_rate("submit_per_session_hour", session_id, _now)
    _record_rate("submit_per_ip_day", hashed_ip, _now)

    # Log the submit before committing so job + log land in one transaction.
    # The worker later locates this row by (demo_session_id, outcome='ok',
    # most recent) to stamp whisper_ms + total_cost_usd.
    db.add(
        DemoRequestLog(
            hashed_ip=hashed_ip,
            demo_session_id=session_id,
            outcome=DemoOutcome.OK,
        )
    )
    await db.commit()

    analytics_svc.capture_demo_event(
        "demo_submit",
        demo_session_id=session_id,
        properties={
            "outcome": DemoOutcome.OK,
            "entry_id": str(entry_uuid),
            "hashed_ip": hashed_ip,
        },
    )
    metrics_svc.demo_submit_total.labels(outcome=DemoOutcome.OK).inc()

    return SubmitResponse(entry_id=body.entry_id, job_id=str(job.id))


@router.get("/status/{entry_id}", response_model=StatusResponse)
async def status(
    entry_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    _require_enabled()
    hashed_ip = extract_hashed_ip(request)
    cookie_session = _session_id_from_cookie(request)
    _enforce_rate_limits(
        request, hashed_ip=hashed_ip, session_id=cookie_session, kind="status"
    )

    try:
        entry_uuid = uuid.UUID(entry_id)
    except ValueError:
        # 404, not 400 — don't leak "the id format is valid" either.
        raise HTTPException(status_code=404)

    result = await db.execute(
        select(Entry).where(
            Entry.id == entry_uuid,
            Entry.user_id.is_(None),
        )
    )
    entry = result.scalar_one_or_none()
    # 404 on every mismatch (no cookie, wrong session, not found) so we
    # can't be probed for entry existence.
    if not entry or not cookie_session or entry.demo_session_id != cookie_session:
        raise HTTPException(status_code=404)

    job_result = await db.execute(
        select(Job)
        .where(Job.entry_id == entry_uuid)
        .order_by(desc(Job.created_at))
        .limit(1)
    )
    job = job_result.scalar_one_or_none()

    class_rows_result = await db.execute(
        select(EntryClassification)
        .where(EntryClassification.entry_id == entry_uuid)
        .order_by(EntryClassification.display_order)
    )
    class_rows = list(class_rows_result.scalars().all())

    meta_result = await db.execute(
        select(EntryMetadata).where(
            EntryMetadata.entry_id == entry_uuid,
            EntryMetadata.key == DEMO_TEASER_METADATA_KEY,
        )
    )
    meta = meta_result.scalar_one_or_none()
    demo_teaser = None
    if meta is not None and meta.value is not None:
        # EntryMetadata.value is JSONB; stringified teasers land here as a
        # dict like {"text": "..."} or a bare string. Accept both shapes.
        if isinstance(meta.value, dict):
            demo_teaser = meta.value.get("text")
        elif isinstance(meta.value, str):
            demo_teaser = meta.value

    # Derive step from Job + row presence.
    if job is None:
        step = "queued"
    elif job.status == JobStatus.DONE:
        step = "done"
    elif job.status == JobStatus.FAILED:
        step = "failed"
    elif job.step:
        step = job.step
    else:
        step = "queued"

    classifications = [
        {
            "category": r.category,
            "text": r.edited_text if r.edited_text else r.extracted_text,
            "display_order": r.display_order,
        }
        for r in class_rows
    ]
    summary = _derive_mechanical_summary(class_rows) if step == "done" else None

    return StatusResponse(
        step=step,
        transcript=entry.transcript,
        classifications=classifications,
        summary=summary,
        demo_teaser=demo_teaser,
    )
