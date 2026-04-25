"""
Audio processing worker.

Runs as a separate process alongside the FastAPI server.
Polls the jobs table, processes PENDING jobs through the pipeline:
  1. Download audio from object storage
  2. Transcribe via OpenAI Whisper
  3. Classify via GPT-4o-mini (multi-entry: 1 transcript → N classifications)
  4. Write notification row (Supabase Realtime delivers to frontend)

Start with: python -m app.services.worker
"""
import asyncio
import json
import logging
import os
import tempfile
import time
from datetime import datetime, date, timezone, timedelta
from decimal import Decimal
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import async_session
from ..models.entry import Entry
from ..models.classification import EntryClassification
from ..models.demo import (
    DEMO_TEASER_METADATA_KEY,
    DemoCostCounter,
    DemoOutcome,
    DemoRequestLog,
)
from ..models.entry_metadata import EntryMetadata
from ..models.jobs import Job, JobStatus
from ..models.notification import Notification
from ..services import analytics as analytics_svc
from ..services import metrics as metrics_svc
from ..services import queue as queue_svc
from ..services import storage as storage_svc
from ..services.categorization import categorize_text
from ..services.demo_pricing import whisper_cost_usd
from ..services.teaser import compute_teaser
from ..services.transcript_refiner import refine_transcript
from openai import AsyncOpenAI
from ..settings import settings

logger = logging.getLogger(__name__)

_openai: AsyncOpenAI | None = None

# Jobs stuck in PROCESSING longer than this are considered dead and will be failed.
_STALE_JOB_THRESHOLD = timedelta(minutes=5)

# Notification rows are transient pub/sub events consumed by Supabase Realtime.
# After the frontend has rendered the update, rows have no further value, so we
# delete anything older than this to keep the table bounded.
_NOTIFICATION_TTL = timedelta(hours=24)
_NOTIFICATION_CLEANUP_INTERVAL = timedelta(hours=1)


def _get_openai() -> AsyncOpenAI:
    global _openai
    if _openai is None:
        _openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _openai


async def _recover_stale_jobs(db: AsyncSession) -> None:
    """
    At worker startup, fail any PROCESSING jobs that have been stuck for more than
    _STALE_JOB_THRESHOLD. This handles the case where the worker crashed mid-pipeline
    and left jobs in PROCESSING with no WebSocket event ever sent.
    """
    cutoff = datetime.now(timezone.utc) - _STALE_JOB_THRESHOLD
    result = await db.execute(
        select(Job).where(
            Job.status == JobStatus.PROCESSING,
            Job.updated_at < cutoff,
        )
    )
    stale_jobs = result.scalars().all()
    for job in stale_jobs:
        logger.warning(f"Recovering stale job {job.id} (stuck since {job.updated_at})")
        await queue_svc.fail_job(db, job, "Worker restarted — job was stuck in PROCESSING")
    if stale_jobs:
        await db.commit()
        logger.info(f"Recovered {len(stale_jobs)} stale job(s)")


async def _debit_demo_cost(
    *,
    demo_session_id: str,
    audio_seconds: float | int | None,
    whisper_ms: int | None,
) -> Decimal:
    """Whisper-only cost debit for a demo job.

    Atomically increments today's demo_cost_counter row and updates the
    matching demo_request_log row. Opens its own session so SELECT ... FOR
    UPDATE runs in a transaction isolated from the main pipeline session.

    Returns the Decimal cost for callers that want to log/emit it without
    a second pricing computation. Categorize-step GPT tokens are not yet
    threaded into the worker; when they are, a second debit goes here.
    """
    total_cost = whisper_cost_usd(audio_seconds)
    today = datetime.now(timezone.utc).date()
    async with async_session() as cost_db:
        async with cost_db.begin():
            # INSERT ... ON CONFLICT lets the first demo of the day create
            # the row without a race; subsequent calls fall through to the
            # update branch.
            stmt = (
                pg_insert(DemoCostCounter)
                .values(date=today, cost_usd=Decimal("0"))
                .on_conflict_do_nothing(index_elements=[DemoCostCounter.date])
            )
            await cost_db.execute(stmt)
            # Now hold the row lock for the debit.
            locked = await cost_db.execute(
                select(DemoCostCounter)
                .where(DemoCostCounter.date == today)
                .with_for_update()
            )
            row = locked.scalar_one()
            row.cost_usd = (Decimal(row.cost_usd) + total_cost).quantize(
                Decimal("0.0001")
            )
            row.updated_at = datetime.now(timezone.utc)
            # Mirror today's running total into the Prometheus gauge so
            # `/metrics` reflects spend without a follow-up SELECT.
            try:
                metrics_svc.demo_cost_usd_today.set(float(row.cost_usd))
            except Exception:  # noqa: BLE001 — metrics never break debit
                pass

        # Update the most recent submit log row for this session. Written
        # out of band; if no matching row exists (shouldn't happen in
        # normal flow), we just skip — logs are advisory.
        async with cost_db.begin():
            result = await cost_db.execute(
                select(DemoRequestLog)
                .where(
                    DemoRequestLog.demo_session_id == demo_session_id,
                    DemoRequestLog.outcome == DemoOutcome.OK,
                )
                .order_by(DemoRequestLog.created_at.desc())
                .limit(1)
            )
            log_row = result.scalar_one_or_none()
            if log_row is not None:
                log_row.whisper_ms = whisper_ms
                log_row.total_cost_usd = total_cost
    return total_cost


async def _maybe_write_demo_teaser(
    *,
    demo_session_id: str,
    current_entry_id,
) -> None:
    """
    Compute and persist the `demo_teaser` EntryMetadata row for a demo
    session — only on the 2nd+ entry, only when `FLYWHEEL_ENABLED`, only
    when the safety filters in `services/teaser.compute_teaser` produce a
    non-None stem.

    Opens its own session so that a teaser write rolling back never
    affects the main pipeline transaction. The status endpoint reads
    `EntryMetadata.value["text"]`, so we shape the row as
    `{"text": <rendered copy>, "stem": <stem>, "count": <distinct entries>}`.

    Cap the input at the 5 most recent transcripts to bound cost and
    keep the teaser focused on the recent session shape.
    """
    if not settings.FLYWHEEL_ENABLED:
        return
    try:
        async with async_session() as meta_db:
            # Pull the 5 most-recent completed demo entries in this session.
            # LIMIT pushed into Postgres so a long-lived session doesn't pay
            # for the full history on every new entry. We re-reverse client-
            # side so compute_teaser sees them in chronological order.
            result = await meta_db.execute(
                select(Entry)
                .where(
                    Entry.demo_session_id == demo_session_id,
                    Entry.transcript.isnot(None),
                )
                .order_by(Entry.created_at.desc())
                .limit(5)
            )
            rows = list(reversed(list(result.scalars().all())))
            if len(rows) < 2:
                return  # 2nd+ entry threshold not met

            transcripts = [r.transcript or "" for r in rows]
            # Whisper language detection isn't currently surfaced through
            # the worker — pass None which compute_teaser treats as
            # English. When language detection is wired in, swap to the
            # real value here.
            stem = compute_teaser(transcripts, language=None)
            if not stem:
                return

            count = sum(1 for t in transcripts if stem in t.lower())
            text = f'You mentioned "{stem}" {count} times today.'
            meta_db.add(
                EntryMetadata(
                    entry_id=current_entry_id,
                    key=DEMO_TEASER_METADATA_KEY,
                    value={"text": text, "stem": stem, "count": count},
                )
            )
            await meta_db.commit()
    except Exception as exc:  # noqa: BLE001 — never fail the job
        logger.warning(
            f"demo_teaser compute/write failed for session "
            f"{demo_session_id}: {exc}"
        )


async def _process_job(db: AsyncSession, job: Job) -> None:
    """Run one entry through the full pipeline."""
    result = await db.execute(select(Entry).where(Entry.id == job.entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        await queue_svc.fail_job(db, job, "Entry not found")
        return

    # Capture anonymous-demo context up front so the rest of the pipeline
    # can branch on it cheaply. Authed jobs keep all existing behavior.
    is_demo = job.demo_session_id is not None and job.user_id is None
    whisper_start_ms: int | None = None
    whisper_ms: int | None = None

    try:
        # ── Step 1: Transcribe ───────────────────────────────────────────────
        await queue_svc.mark_step(db, job, "transcribing")
        await db.commit()

        audio_bytes = await storage_svc.download_bytes(entry.raw_audio_key)
        suffix = os.path.splitext(entry.raw_audio_key)[1] or ".webm"

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            whisper_start_ms = int(time.monotonic() * 1000)
            with open(tmp_path, "rb") as f:
                transcript_response = await _get_openai().audio.transcriptions.create(
                    file=f,
                    model="gpt-4o-mini-transcribe",
                )
            whisper_ms = int(time.monotonic() * 1000) - whisper_start_ms
            raw_transcript = transcript_response.text
            logger.info(f"Raw transcript ({len(raw_transcript)} chars): {raw_transcript[:120]}...")
        finally:
            os.unlink(tmp_path)

        # ── Demo cost debit (post-Whisper, before GPT may happen) ────────────
        debited_cost: Decimal | None = None
        if is_demo:
            try:
                if whisper_ms is not None:
                    metrics_svc.demo_whisper_latency_seconds.observe(
                        whisper_ms / 1000.0
                    )
            except Exception:  # noqa: BLE001 — metrics never raise
                pass
            try:
                debited_cost = await _debit_demo_cost(
                    demo_session_id=job.demo_session_id,
                    audio_seconds=entry.duration_seconds,
                    whisper_ms=whisper_ms,
                )
            except Exception as cost_exc:  # noqa: BLE001
                # Never let a cost-accounting blip kill a user's job.
                logger.warning(
                    f"Demo cost debit (whisper) failed for job {job.id}: {cost_exc}"
                )

        # ── Handle empty/silent audio ────────────────────────────────────────
        if not raw_transcript or not raw_transcript.strip():
            logger.info(f"Job {job.id}: empty transcript, skipping refinement and classification")
            entry.transcript = ""
            await db.flush()
            await queue_svc.complete_job(db, job)
            await db.commit()

            # Authed jobs only — anonymous demo has no user inbox to notify.
            if entry.user_id is not None:
                db.add(Notification(
                    user_id=entry.user_id,
                    event_type="entry.classified",
                    payload_json=json.dumps({
                        "entry_id": str(entry.id),
                        "transcript": "",
                        "categories": [],
                    }),
                ))
                await db.commit()
            return

        # ── Step 1b: Refine transcript (LLM post-processing) ─────────────────
        await queue_svc.mark_step(db, job, "refining")
        await db.commit()

        entry.transcript = await refine_transcript(raw_transcript)
        await db.flush()
        logger.info(f"Refined transcript: {entry.transcript[:120]}...")

        # ── Step 2: Classify (multi-entry) ───────────────────────────────────
        await queue_svc.mark_step(db, job, "classifying")
        await db.commit()

        cat_results = await categorize_text(entry.transcript)

        # Insert one EntryClassification row per extracted activity.
        for i, item in enumerate(cat_results):
            est_min = item.get("estimated_minutes")
            try:
                est_min_val = int(est_min) if est_min is not None else None
                if est_min_val is not None and not (0 <= est_min_val <= 1440):
                    est_min_val = None
            except (ValueError, TypeError):
                est_min_val = None
            classification = EntryClassification(
                entry_id=entry.id,
                category=item["category"],
                extracted_text=item.get("text"),
                estimated_minutes=est_min_val,
                display_order=i,
                model_version="gpt-5.4-nano",
            )
            db.add(classification)

        await db.flush()

        await queue_svc.complete_job(db, job)
        await db.commit()

        logger.info(
            f"Job {job.id} done: entry={entry.id} "
            f"classifications={len(cat_results)}"
        )

        # ── Step 4: Write notification (Supabase Realtime delivers to frontend)
        # Anonymous demo jobs have no user_id to notify — the frontend polls
        # /v1/public/demo/status/{entry_id} instead.
        if entry.user_id is not None:
            db.add(Notification(
                user_id=entry.user_id,
                event_type="entry.classified",
                payload_json=json.dumps({
                    "entry_id": str(entry.id),
                    "transcript": entry.transcript,
                    "categories": [
                        {"text": r["text"], "category": r["category"]}
                        for r in cat_results
                    ],
                }),
            ))
            await db.commit()

        # ── Demo teaser (2nd+ demo entry only; gated on FLYWHEEL_ENABLED) ────
        # The helper opens its own session and swallows its own failures so
        # nothing here can fail the job.
        if is_demo:
            await _maybe_write_demo_teaser(
                demo_session_id=job.demo_session_id,
                current_entry_id=entry.id,
            )

            # Pipeline-completed event fires after classifications + teaser
            # are committed so downstream funnels see this as the "real
            # done" moment. Reuses the cost computed during debit when
            # available; falls back to a fresh whisper-only computation if
            # the debit failed. Language detection isn't surfaced through
            # the worker yet.
            try:
                cost_for_event = (
                    debited_cost
                    if debited_cost is not None
                    else whisper_cost_usd(entry.duration_seconds)
                )
                analytics_svc.capture_demo_event(
                    "demo_pipeline_completed",
                    demo_session_id=job.demo_session_id,
                    properties={
                        "whisper_ms": whisper_ms,
                        "total_cost_usd": float(cost_for_event),
                        "language": None,
                    },
                )
            except Exception as exc:  # noqa: BLE001
                logger.debug(f"demo_pipeline_completed capture failed: {exc}")

    except Exception as exc:
        logger.error(f"Job {job.id} failed: {exc}", exc_info=True)
        await db.rollback()

        # Re-open session to record failure
        async with async_session() as db2:
            result2 = await db2.execute(select(Job).where(Job.id == job.id))
            job2 = result2.scalar_one_or_none()
            if job2:
                await queue_svc.fail_job(db2, job2, str(exc))
                await db2.commit()

        try:
            async with async_session() as db3:
                r = await db3.execute(select(Entry).where(Entry.id == job.entry_id))
                e = r.scalar_one_or_none()
                # Skip the failure notification on anonymous-demo entries —
                # they have no user_id and the frontend polls status instead.
                if e and e.user_id is not None:
                    # Do not leak raw exception text to the client — full
                    # traceback is already logged above via exc_info=True.
                    db3.add(Notification(
                        user_id=e.user_id,
                        event_type="entry.failed",
                        payload_json=json.dumps({
                            "entry_id": str(job.entry_id),
                            "error": "Processing failed. Please try again.",
                        }),
                    ))
                    await db3.commit()
        except Exception:
            pass


async def _cleanup_old_notifications(db: AsyncSession) -> None:
    """Delete notification rows older than _NOTIFICATION_TTL."""
    cutoff = datetime.now(timezone.utc) - _NOTIFICATION_TTL
    result = await db.execute(
        delete(Notification).where(Notification.created_at < cutoff)
    )
    await db.commit()
    if result.rowcount:
        logger.info(f"Pruned {result.rowcount} old notification row(s)")


async def run_worker(poll_interval: float = 2.0) -> None:
    """
    Main worker loop. Polls for PENDING jobs and processes them one at a time.
    On startup, recovers any jobs stuck in PROCESSING from a previous crash.
    Run multiple instances to scale throughput.
    """
    logger.info("Worker started — recovering stale jobs and polling...")
    async with async_session() as db:
        await _recover_stale_jobs(db)

    next_cleanup = datetime.now(timezone.utc)

    while True:
        try:
            now = datetime.now(timezone.utc)
            if now >= next_cleanup:
                async with async_session() as db:
                    await _cleanup_old_notifications(db)
                next_cleanup = now + _NOTIFICATION_CLEANUP_INTERVAL

            async with async_session() as db:
                job = await queue_svc.dequeue(db)
                if job:
                    await _process_job(db, job)
                else:
                    await asyncio.sleep(poll_interval)
        except Exception as exc:
            logger.error(f"Worker loop error: {exc}", exc_info=True)
            await asyncio.sleep(poll_interval)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
