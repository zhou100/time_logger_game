"""
Schema + model tests for the anonymous demo infrastructure migration
(`q6r7s8t9u0v1_add_anonymous_demo_infra.py`).

These tests stand up a real PostgreSQL test DB on port 5433, run alembic
up/down, and exercise the new columns + tables end-to-end. They require:
  - postgres running at localhost:5433
  - `TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5433/time_logger_test`

Split from the app's main async fixtures on purpose — we want a dedicated
alembic-controlled engine with no conftest.py interference.
"""
from __future__ import annotations

import os
import subprocess
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session


BACKEND_DIR = Path(__file__).resolve().parent.parent
ASYNC_TEST_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5433/time_logger_test",
)
SYNC_TEST_URL = ASYNC_TEST_URL.replace("postgresql+asyncpg://", "postgresql://")


def _alembic(cmd: list[str]) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["DATABASE_URL"] = ASYNC_TEST_URL
    env["TEST_MODE"] = "true"
    return subprocess.run(
        ["alembic"] + cmd,
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


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
    reason="Test DB on :5433 not reachable; skipping migration roundtrip tests.",
)


# ── Migration upgrade / downgrade roundtrip ───────────────────────────────────

@pytest.fixture
def head_db():
    """Ensure DB is at head before each test; return a sync Session."""
    # Reset to head (idempotent if already there)
    r = _alembic(["upgrade", "head"])
    assert r.returncode == 0, f"alembic upgrade head failed: {r.stderr}"
    engine = create_engine(SYNC_TEST_URL)
    try:
        yield engine
    finally:
        # Clean any test rows we injected so we don't poison the next test
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM demo_request_log"))
            conn.execute(text("DELETE FROM demo_cost_counter"))
            conn.execute(
                text("DELETE FROM entries WHERE user_id IS NULL OR demo_session_id IS NOT NULL")
            )
        engine.dispose()


def test_upgrade_head_creates_new_schema(head_db):
    """After upgrade head, the new columns + tables must exist."""
    with head_db.connect() as conn:
        cols = {
            r[0]
            for r in conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name='entries'"
                )
            )
        }
        assert "demo_session_id" in cols
        assert "expires_at" in cols

        # user_id must be nullable now
        nullability = conn.execute(
            text(
                "SELECT is_nullable FROM information_schema.columns "
                "WHERE table_name='entries' AND column_name='user_id'"
            )
        ).scalar_one()
        assert nullability == "YES"

        job_cols = {
            r[0]
            for r in conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name='jobs'"
                )
            )
        }
        assert "demo_session_id" in job_cols
        job_nullability = conn.execute(
            text(
                "SELECT is_nullable FROM information_schema.columns "
                "WHERE table_name='jobs' AND column_name='user_id'"
            )
        ).scalar_one()
        assert job_nullability == "YES"

        tables = {
            r[0]
            for r in conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema='public'"
                )
            )
        }
        assert "demo_cost_counter" in tables
        assert "demo_request_log" in tables

        # Partial indexes present
        idx_rows = conn.execute(
            text("SELECT indexname FROM pg_indexes WHERE tablename IN ('entries','jobs')")
        ).all()
        index_names = {r[0] for r in idx_rows}
        assert "ix_entries_demo_session_id" in index_names
        assert "ix_entries_expires_at_demo" in index_names
        assert "ix_jobs_demo_session_id" in index_names


def test_downgrade_then_upgrade_roundtrip(head_db):
    """downgrade -1 removes the new schema; upgrade head restores it."""
    r_down = _alembic(["downgrade", "-1"])
    assert r_down.returncode == 0, f"downgrade failed: {r_down.stderr}"

    with head_db.connect() as conn:
        cols = {
            r[0]
            for r in conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name='entries'"
                )
            )
        }
        assert "demo_session_id" not in cols
        assert "expires_at" not in cols
        nullability = conn.execute(
            text(
                "SELECT is_nullable FROM information_schema.columns "
                "WHERE table_name='entries' AND column_name='user_id'"
            )
        ).scalar_one()
        assert nullability == "NO"

        tables = {
            r[0]
            for r in conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema='public'"
                )
            )
        }
        assert "demo_cost_counter" not in tables
        assert "demo_request_log" not in tables

    # Restore
    r_up = _alembic(["upgrade", "head"])
    assert r_up.returncode == 0, f"upgrade head failed: {r_up.stderr}"


def test_downgrade_fails_loudly_with_anonymous_row(head_db):
    """
    If a demo row survived into a downgrade window, the downgrade MUST fail
    rather than silently orphan / delete user data.
    """
    sess_id = "sweep-guard-" + uuid.uuid4().hex[:12]
    entry_id = uuid.uuid4()
    with head_db.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO entries (id, user_id, raw_audio_key, demo_session_id, "
                "expires_at, created_at) VALUES (:id, NULL, :k, :s, :exp, now())"
            ),
            {
                "id": entry_id,
                "k": f"anonymous-demo/{sess_id}/x.webm",
                "s": sess_id,
                "exp": datetime.now(timezone.utc) + timedelta(hours=24),
            },
        )

    try:
        r = _alembic(["downgrade", "-1"])
        assert r.returncode != 0, "Expected downgrade to fail with anonymous rows present"
        # stderr should mention the row count guard
        combined = (r.stdout + r.stderr).lower()
        assert "null user_id" in combined or "cannot downgrade" in combined
    finally:
        with head_db.begin() as conn:
            conn.execute(text("DELETE FROM entries WHERE id = :id"), {"id": entry_id})
        # Make sure we're at head regardless
        _alembic(["upgrade", "head"])


# ── ORM model shape ───────────────────────────────────────────────────────────

def test_entry_accepts_anonymous_row(head_db):
    """ORM-level insert of an anonymous entry reads back correctly."""
    from app.models.entry import Entry
    from app.models.base import Base  # noqa: F401 — triggers metadata register

    sess_id = "orm-anon-" + uuid.uuid4().hex[:12]
    expires = datetime.now(timezone.utc) + timedelta(hours=24)

    with Session(head_db) as sess, sess.begin():
        e = Entry(
            user_id=None,
            demo_session_id=sess_id,
            expires_at=expires,
            raw_audio_key=f"anonymous-demo/{sess_id}/x.webm",
        )
        sess.add(e)
        sess.flush()
        eid = e.id

    with Session(head_db) as sess:
        fetched = sess.get(Entry, eid)
        assert fetched is not None
        assert fetched.user_id is None
        assert fetched.demo_session_id == sess_id
        assert fetched.expires_at is not None


def test_entry_still_accepts_authed_row(head_db):
    """Regression: the authed flow must still work after relaxing user_id."""
    from app.models.entry import Entry
    from app.models.user import User

    with Session(head_db) as sess, sess.begin():
        u = User(email=f"demo-{uuid.uuid4().hex[:8]}@example.com",
                 hashed_password="x", is_active=True)
        sess.add(u)
        sess.flush()
        e = Entry(user_id=u.id, raw_audio_key=f"audio/{u.id}/x.webm")
        sess.add(e)
        sess.flush()
        eid = e.id
        uid = u.id

    with Session(head_db) as sess:
        fetched = sess.get(Entry, eid)
        assert fetched is not None
        assert fetched.user_id == uid
        assert fetched.demo_session_id is None

        sess.execute(text("DELETE FROM entries WHERE id = :id"), {"id": eid})
        sess.execute(text("DELETE FROM users WHERE id = :id"), {"id": uid})
        sess.commit()
