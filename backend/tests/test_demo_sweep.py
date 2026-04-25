"""
Tests for `app.services.demo_sweep`.

Exercises the two-step idempotent sweep:
  1. select expired anonymous entries
  2. delete their blobs
  3. delete their DB rows
  4. prune demo_request_log rows older than 14 days

Blob deletion errors are logged but must not abort the sweep.

Requires a real PostgreSQL test DB at port 5433 (same as migration tests).
"""
from __future__ import annotations

import os
import uuid
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session


BACKEND_DIR = Path(__file__).resolve().parent.parent
ASYNC_TEST_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5433/time_logger_test",
)
SYNC_TEST_URL = ASYNC_TEST_URL.replace("postgresql+asyncpg://", "postgresql://")


def _db_reachable() -> bool:
    try:
        eng = create_engine(SYNC_TEST_URL, connect_args={"connect_timeout": 2})
        with eng.connect() as c:
            c.execute(text("SELECT 1"))
        eng.dispose()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _db_reachable(),
    reason="Test DB on :5433 not reachable; skipping sweep tests.",
)


@pytest.fixture
def head_db():
    """Ensure DB is at head, return a sync engine, clean demo tables after."""
    env = os.environ.copy()
    env["DATABASE_URL"] = ASYNC_TEST_URL
    env["TEST_MODE"] = "true"
    r = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=str(BACKEND_DIR), env=env, capture_output=True, text=True, check=False,
    )
    assert r.returncode == 0, f"alembic upgrade head failed: {r.stderr}"

    engine = create_engine(SYNC_TEST_URL)
    # Pre-clean (in case prior test left rows)
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM demo_request_log"))
        conn.execute(
            text("DELETE FROM entries WHERE user_id IS NULL OR demo_session_id IS NOT NULL")
        )
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM demo_request_log"))
            conn.execute(
                text("DELETE FROM entries WHERE user_id IS NULL OR demo_session_id IS NOT NULL")
            )
        engine.dispose()


def _insert_entry(engine, *, session_id: str, expires_at: datetime,
                  raw_audio_key: str | None = "anonymous-demo/x/y.webm"):
    entry_id = uuid.uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO entries (id, user_id, demo_session_id, expires_at, "
                "raw_audio_key, created_at) VALUES "
                "(:id, NULL, :s, :exp, :k, now())"
            ),
            {"id": entry_id, "s": session_id, "exp": expires_at, "k": raw_audio_key},
        )
    return entry_id


def _count_entries(engine, entry_id) -> int:
    with engine.connect() as conn:
        return conn.execute(
            text("SELECT COUNT(*) FROM entries WHERE id = :id"), {"id": entry_id}
        ).scalar_one()


def _switch_to_async():
    """Point the async session factory at the test DB for the sweep run."""
    # The demo_sweep module opens async_session() — it reads from app.db at
    # import time. In tests we already have TEST_MODE=true + TEST_DATABASE_URL
    # set in the environment, so app.db.DATABASE_URL picks up the test DB.
    os.environ["TEST_MODE"] = "true"
    os.environ.setdefault(
        "TEST_DATABASE_URL",
        ASYNC_TEST_URL,
    )


# ── Actual sweep behavior ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sweep_deletes_expired_entry_and_calls_blob_delete(head_db):
    _switch_to_async()
    session_id = f"sweep-ok-{uuid.uuid4().hex[:8]}"
    expired = datetime.now(timezone.utc) - timedelta(hours=1)
    entry_id = _insert_entry(head_db, session_id=session_id, expires_at=expired,
                             raw_audio_key=f"anonymous-demo/{session_id}/clip.webm")

    delete_object = AsyncMock()
    with patch("app.services.demo_sweep.storage_svc.delete_object", delete_object):
        from app.services.demo_sweep import run_demo_sweep_once
        result = await run_demo_sweep_once()

    assert result["entries_deleted"] == 1
    delete_object.assert_awaited_once_with(f"anonymous-demo/{session_id}/clip.webm")
    assert _count_entries(head_db, entry_id) == 0


@pytest.mark.asyncio
async def test_sweep_leaves_non_expired_entries(head_db):
    _switch_to_async()
    session_id = f"sweep-future-{uuid.uuid4().hex[:8]}"
    future = datetime.now(timezone.utc) + timedelta(hours=5)
    entry_id = _insert_entry(head_db, session_id=session_id, expires_at=future)

    delete_object = AsyncMock()
    with patch("app.services.demo_sweep.storage_svc.delete_object", delete_object):
        from app.services.demo_sweep import run_demo_sweep_once
        result = await run_demo_sweep_once()

    assert result["entries_deleted"] == 0
    delete_object.assert_not_awaited()
    assert _count_entries(head_db, entry_id) == 1


@pytest.mark.asyncio
async def test_sweep_continues_when_blob_delete_raises(head_db):
    """
    A single blob delete failure must not abort the sweep — the row is left
    in place so the next cycle retries, and other rows keep getting processed.
    """
    _switch_to_async()
    expired = datetime.now(timezone.utc) - timedelta(hours=1)

    bad_session = f"sweep-bad-{uuid.uuid4().hex[:8]}"
    good_session = f"sweep-good-{uuid.uuid4().hex[:8]}"
    bad_id = _insert_entry(head_db, session_id=bad_session, expires_at=expired,
                           raw_audio_key=f"anonymous-demo/{bad_session}/bad.webm")
    good_id = _insert_entry(head_db, session_id=good_session, expires_at=expired,
                            raw_audio_key=f"anonymous-demo/{good_session}/good.webm")

    async def flaky(key: str):
        if "bad" in key:
            raise RuntimeError("S3 unreachable")
        return None

    with patch("app.services.demo_sweep.storage_svc.delete_object", side_effect=flaky):
        from app.services.demo_sweep import run_demo_sweep_once
        result = await run_demo_sweep_once()

    # Only the good row is deleted; bad row survives for next cycle.
    assert result["entries_deleted"] == 1
    assert _count_entries(head_db, good_id) == 0
    assert _count_entries(head_db, bad_id) == 1


@pytest.mark.asyncio
async def test_sweep_prunes_old_request_log(head_db):
    _switch_to_async()
    old = datetime.now(timezone.utc) - timedelta(days=20)
    fresh = datetime.now(timezone.utc) - timedelta(days=2)
    with head_db.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO demo_request_log (hashed_ip, outcome, created_at) "
                "VALUES ('hash-old', 'ok', :old), ('hash-fresh', 'ok', :fresh)"
            ),
            {"old": old, "fresh": fresh},
        )

    with patch("app.services.demo_sweep.storage_svc.delete_object", AsyncMock()):
        from app.services.demo_sweep import run_demo_sweep_once
        result = await run_demo_sweep_once()

    assert result["request_log_pruned"] == 1

    with head_db.connect() as conn:
        rows = conn.execute(
            text("SELECT hashed_ip FROM demo_request_log ORDER BY created_at")
        ).all()
    assert [r[0] for r in rows] == ["hash-fresh"]


@pytest.mark.asyncio
async def test_sweep_handles_empty_state(head_db):
    """With no rows at all, sweep returns zero counts without error."""
    _switch_to_async()
    with patch("app.services.demo_sweep.storage_svc.delete_object", AsyncMock()):
        from app.services.demo_sweep import run_demo_sweep_once
        result = await run_demo_sweep_once()
    assert result == {"entries_deleted": 0, "request_log_pruned": 0}
