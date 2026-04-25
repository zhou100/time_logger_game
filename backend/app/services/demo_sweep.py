"""
Anonymous demo TTL sweep.

Runs alongside `run_worker` as an `asyncio.create_task` in the FastAPI
lifespan. Every `poll_interval` seconds (default 1h):

  1. Selects `entries` rows where `expires_at < now()` AND `demo_session_id
     IS NOT NULL`. These are abandoned anonymous recordings whose 24h TTL
     has lapsed.
  2. Attempts to delete each row's `raw_audio_key` from object storage.
     Swallows 404 / NoSuchKey (already gone) and logs+continues on any
     other error — a single blob failure must not abort the sweep.
  3. Deletes the expired rows in a single statement. Classifications,
     metadata, and jobs CASCADE.

Step 2/3 are deliberately ordered this way so that a crash between them
leaves orphan DB rows (harmless — next sweep retries) rather than orphan
blobs (silent storage cost).

Finally it prunes `demo_request_log` rows older than 14 days.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import async_session
from ..models.entry import Entry
from ..models.demo import DemoRequestLog
from ..services import metrics as metrics_svc
from ..services import storage as storage_svc

logger = logging.getLogger(__name__)

# Matches the storage layer's 404-like error codes across S3, R2, and MinIO.
_NOT_FOUND_CODES = {"404", "NoSuchKey", "NotFound"}

# Log lines older than this are pruned from demo_request_log.
_REQUEST_LOG_TTL = timedelta(days=14)


async def _sweep_expired_entries(db: AsyncSession) -> int:
    """Two-step idempotent sweep: blobs first (batched), rows second.

    Returns rows deleted. Per the design's atomicity rule, a blob delete
    failure leaves the row for the next sweep — orphan rows with missing
    blobs are harmless and resolve themselves over time.
    """
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Entry.id, Entry.raw_audio_key).where(
            Entry.demo_session_id.is_not(None),
            Entry.expires_at.is_not(None),
            Entry.expires_at < now,
        )
    )
    rows = result.all()
    if not rows:
        return 0

    keys = [row.raw_audio_key for row in rows if row.raw_audio_key]
    failed_keys: set[str] = set()
    if keys:
        try:
            errors = await storage_svc.delete_objects(keys)
            for err in errors:
                code = err.get("Code") if isinstance(err, dict) else None
                key = err.get("Key") if isinstance(err, dict) else None
                if code in _NOT_FOUND_CODES:
                    logger.debug(f"Sweep: blob {key} already gone")
                    continue
                if key:
                    failed_keys.add(key)
                logger.warning(f"Sweep: blob {key} delete error {code}; deferring row")
        except Exception as exc:  # noqa: BLE001 — never fail the whole sweep
            logger.warning(
                f"Sweep: batch blob delete raised "
                f"({type(exc).__name__}: {exc}); deferring all rows"
            )
            failed_keys = set(keys)

    deletable_ids = [
        row.id for row in rows if row.raw_audio_key not in failed_keys
    ]
    if not deletable_ids:
        return 0

    await db.execute(delete(Entry).where(Entry.id.in_(deletable_ids)))
    await db.commit()
    logger.info(f"Sweep: deleted {len(deletable_ids)} expired anonymous entry/entries")
    return len(deletable_ids)


async def _prune_request_log(db: AsyncSession) -> int:
    cutoff = datetime.now(timezone.utc) - _REQUEST_LOG_TTL
    result = await db.execute(
        delete(DemoRequestLog).where(DemoRequestLog.created_at < cutoff)
    )
    await db.commit()
    pruned = result.rowcount or 0
    if pruned:
        logger.info(f"Sweep: pruned {pruned} demo_request_log row(s) older than 14d")
    return pruned


async def run_demo_sweep_once(db: Optional[AsyncSession] = None) -> dict:
    """
    One sweep pass. Exposed separately so tests can drive it without the loop.
    """
    if db is not None:
        entries_deleted = await _sweep_expired_entries(db)
        logs_pruned = await _prune_request_log(db)
    else:
        async with async_session() as s:
            entries_deleted = await _sweep_expired_entries(s)
        async with async_session() as s:
            logs_pruned = await _prune_request_log(s)
    # Surface sweep deltas on Prometheus so dashboards can spot a stalled
    # sweep (counter flat for 2h+) without scraping logs.
    if entries_deleted:
        metrics_svc.demo_sweep_expired_total.inc(entries_deleted)
    if logs_pruned:
        metrics_svc.demo_sweep_pruned_log_total.inc(logs_pruned)
    # Drop stale rate-limit deques so a long-running process doesn't
    # accumulate one-shot keys forever.
    try:
        from ..routes.public_demo import gc_rate_buckets
        rl_evicted = gc_rate_buckets()
    except Exception as exc:  # noqa: BLE001 — never fail the sweep on this
        logger.warning(f"Sweep: rate-bucket GC failed: {exc}")
        rl_evicted = 0
    return {
        "entries_deleted": entries_deleted,
        "request_log_pruned": logs_pruned,
        "rate_buckets_evicted": rl_evicted,
    }


async def run_demo_sweep(poll_interval: float = 3600.0) -> None:
    """
    Forever loop. One crash inside a sweep pass is logged and the loop sleeps
    `poll_interval` before retrying; we never let the task die.
    """
    logger.info(
        f"Demo sweep started — interval={poll_interval}s "
        f"request_log_ttl={_REQUEST_LOG_TTL}"
    )
    while True:
        try:
            await run_demo_sweep_once()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — swallow to keep loop alive
            logger.error(f"Demo sweep iteration failed: {exc}", exc_info=True)
        await asyncio.sleep(poll_interval)
