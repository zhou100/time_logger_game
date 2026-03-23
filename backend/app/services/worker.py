"""
Audio processing worker.

Runs as a separate process alongside the FastAPI server.
Polls the jobs table, processes PENDING jobs through the pipeline:
  1. Download audio from object storage
  2. Transcribe via OpenAI Whisper
  3. Classify via GPT-4o-mini
  4. Update gamification stats
  5. Notify connected WebSocket clients

Start with: python -m app.services.worker
"""
import asyncio
import logging
import os
import tempfile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import async_session
from ..models.entry import Entry
from ..models.classification import EntryClassification
from ..models.entry_metadata import EntryMetadata
from ..models.jobs import Job
from ..services import queue as queue_svc
from ..services import storage as storage_svc
from ..services.categorization import categorize_text
from ..services.gamification import process_entry_created
from openai import AsyncOpenAI
from ..settings import settings

logger = logging.getLogger(__name__)

_openai: AsyncOpenAI | None = None


def _get_openai() -> AsyncOpenAI:
    global _openai
    if _openai is None:
        _openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _openai


async def _process_job(db: AsyncSession, job: Job) -> None:
    """Run one entry through the full pipeline."""
    result = await db.execute(select(Entry).where(Entry.id == job.entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        await queue_svc.fail_job(db, job, "Entry not found")
        return

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
            with open(tmp_path, "rb") as f:
                transcript_response = await _get_openai().audio.transcriptions.create(
                    file=f, model="whisper-1"
                )
            entry.transcript = transcript_response.text
            await db.flush()
        finally:
            os.unlink(tmp_path)

        # ── Step 2: Classify ─────────────────────────────────────────────────
        await queue_svc.mark_step(db, job, "classifying")
        await db.commit()

        cat_result = await categorize_text(entry.transcript)

        classification = EntryClassification(
            entry_id=entry.id,
            category=cat_result.get("category", "THOUGHT"),
            confidence=cat_result.get("confidence"),
            model_version="gpt-4o-mini",
        )
        db.add(classification)

        # Persist metadata (priority, time_spent, tags)
        metadata = cat_result.get("metadata", {})
        for key, value in metadata.items():
            if value is not None:
                db.add(EntryMetadata(entry_id=entry.id, key=key, value=value))

        await db.flush()

        # ── Step 3: Gamification ─────────────────────────────────────────────
        stats = await process_entry_created(
            db, entry.user_id, str(entry.id), entry.duration_seconds
        )

        await queue_svc.complete_job(db, job)
        await db.commit()

        logger.info(
            f"Job {job.id} done: entry={entry.id} "
            f"category={classification.category} streak={stats.current_streak}"
        )

        # ── Step 4: Notify WebSocket clients ─────────────────────────────────
        try:
            from ..routes.v1.ws import manager
            await manager.send_to_user(entry.user_id, {
                "type": "entry.classified",
                "entry_id": str(entry.id),
                "transcript": entry.transcript,
                "category": classification.category,
            })
            await manager.send_to_user(entry.user_id, {
                "type": "stats.updated",
                "total_entries": stats.total_entries,
                "current_streak": stats.current_streak,
                "level": stats.level,
                "xp": stats.xp,
            })
        except Exception as ws_exc:
            logger.debug(f"WebSocket notify skipped: {ws_exc}")

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
            from ..routes.v1.ws import manager
            async with async_session() as db3:
                r = await db3.execute(select(Entry).where(Entry.id == job.entry_id))
                e = r.scalar_one_or_none()
                if e:
                    await manager.send_to_user(e.user_id, {
                        "type": "entry.failed",
                        "entry_id": str(job.entry_id),
                        "error": str(exc),
                    })
        except Exception:
            pass


async def run_worker(poll_interval: float = 2.0) -> None:
    """
    Main worker loop. Polls for PENDING jobs and processes them one at a time.
    Run multiple instances to scale throughput.
    """
    logger.info("Worker started, polling for jobs...")
    while True:
        try:
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
