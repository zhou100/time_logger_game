"""
Tests for POST /v1/entries/claim-demo-session.

Exercises the single-transaction UPDATE that flips ownership on demo
entries + jobs, verifies idempotency, validates the silent-no-op shape on
bad/expired/malformed claim_tokens, and asserts that S3 blobs are never
touched (claim is row-flip only — sweep handles blobs separately).
"""
from __future__ import annotations

import hashlib
import hmac
import importlib
import os
import subprocess
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, text


BACKEND_DIR = Path(__file__).resolve().parent.parent
ASYNC_TEST_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5433/time_logger_test",
)
SYNC_TEST_URL = ASYNC_TEST_URL.replace("postgresql+asyncpg://", "postgresql://")

TEST_HMAC = "test-claim-hmac-secret"


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
    reason="Test DB on :5433 not reachable; skipping claim-endpoint tests.",
)


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("DEMO_CLAIM_HMAC_SECRET", TEST_HMAC)
    monkeypatch.setenv("DATABASE_URL", ASYNC_TEST_URL)
    monkeypatch.setenv("TEST_DATABASE_URL", ASYNC_TEST_URL)
    monkeypatch.setenv("TEST_MODE", "true")
    import app.settings as settings_mod
    settings_mod.get_settings.cache_clear()
    importlib.reload(settings_mod)
    import app.routes.v1.claim as claim_mod
    importlib.reload(claim_mod)


@pytest.fixture
def test_engine():
    """
    Build a fresh async engine bound to the test DB and patch
    `app.db.async_session` to use it.

    `app.db` is imported by conftest before our env vars are set, so its
    module-level engine often points to the dev DB. We override here so
    the route's `get_db` dep yields a session against the test schema.
    """
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    import app.db as db_mod

    new_engine = create_async_engine(ASYNC_TEST_URL, future=True)
    new_factory = sessionmaker(
        bind=new_engine, class_=AsyncSession,
        expire_on_commit=False, autocommit=False, autoflush=False,
    )
    original_engine = db_mod.engine
    original_factory = db_mod.async_session
    db_mod.engine = new_engine
    db_mod.async_session = new_factory
    try:
        yield new_engine
    finally:
        db_mod.engine = original_engine
        db_mod.async_session = original_factory

        async def _dispose():
            await new_engine.dispose()

        import asyncio
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
        loop.run_until_complete(_dispose())


@pytest.fixture
def head_db(test_engine):
    """Migrate to head, return a sync engine, clean rows after."""
    env = os.environ.copy()
    env["DATABASE_URL"] = ASYNC_TEST_URL
    env["TEST_MODE"] = "true"
    r = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=str(BACKEND_DIR), env=env, capture_output=True, text=True, check=False,
    )
    assert r.returncode == 0, f"alembic upgrade head failed: {r.stderr}"

    engine = create_engine(SYNC_TEST_URL)
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM jobs"))
        conn.execute(text("DELETE FROM entries"))
        conn.execute(text("DELETE FROM users"))
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM jobs"))
            conn.execute(text("DELETE FROM entries"))
            conn.execute(text("DELETE FROM users"))
        engine.dispose()


def _insert_user(engine, *, email="claimer@example.com") -> int:
    with engine.begin() as conn:
        result = conn.execute(
            text(
                "INSERT INTO users (email, hashed_password, is_active) "
                "VALUES (:e, '', TRUE) RETURNING id"
            ),
            {"e": email},
        )
        return result.scalar_one()


def _insert_demo_entry(engine, *, session_id: str, expires_at=None) -> uuid.UUID:
    entry_id = uuid.uuid4()
    expires = expires_at or (datetime.now(timezone.utc) + timedelta(hours=24))
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO entries (id, user_id, demo_session_id, expires_at, "
                "raw_audio_key, created_at) VALUES "
                "(:id, NULL, :s, :exp, :k, now())"
            ),
            {
                "id": entry_id,
                "s": session_id,
                "exp": expires,
                "k": f"anonymous-demo/{session_id}/{entry_id}.webm",
            },
        )
    return entry_id


def _insert_demo_job(engine, *, entry_id: uuid.UUID, session_id: str) -> uuid.UUID:
    job_id = uuid.uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO jobs (id, entry_id, user_id, demo_session_id, status, "
                "step, created_at) VALUES (:id, :eid, NULL, :s, 'done', 'complete', now())"
            ),
            {"id": job_id, "eid": entry_id, "s": session_id},
        )
    return job_id


def _build_claim_token(session_id: str, exp: datetime) -> str:
    """Mirrors public_demo._build_claim_token — kept local so tests don't
    depend on the route file's internal helper layout."""
    iso = exp.astimezone(timezone.utc).isoformat()
    payload = f"{session_id}|{iso}"
    sig = hmac.new(
        TEST_HMAC.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"{payload}|{sig}"


def _make_app_with_user(user_id: int) -> FastAPI:
    """Build a FastAPI app with the claim router and dep overrides."""
    from app.routes.v1.claim import router as claim_router
    from app.utils.auth import get_current_user
    from app.db import get_db, async_session
    from app.models.user import User as UserModel

    application = FastAPI()
    application.include_router(claim_router, prefix="/v1")

    async def _override_db():
        async with async_session() as s:
            yield s

    fake_user = MagicMock(spec=UserModel)
    fake_user.id = user_id

    application.dependency_overrides[get_db] = _override_db
    application.dependency_overrides[get_current_user] = lambda: fake_user
    return application


# ── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_claim_happy_path_flips_ownership(head_db):
    user_id = _insert_user(head_db)
    sid = "a" * 64
    e1 = _insert_demo_entry(head_db, session_id=sid)
    e2 = _insert_demo_entry(head_db, session_id=sid)
    j1 = _insert_demo_job(head_db, entry_id=e1, session_id=sid)
    j2 = _insert_demo_job(head_db, entry_id=e2, session_id=sid)

    token = _build_claim_token(sid, datetime.now(timezone.utc) + timedelta(hours=1))
    app = _make_app_with_user(user_id)

    with patch("app.services.storage.delete_object", AsyncMock()) as delete_mock:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/v1/entries/claim-demo-session",
                json={"claim_token": token},
            )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["claimed"] == 2
    assert set(data["entry_ids"]) == {str(e1), str(e2)}

    # Rows now owned by user; demo_session_id and expires_at cleared.
    with head_db.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT id, user_id, demo_session_id, expires_at FROM entries "
                "WHERE id = ANY(:ids)"
            ),
            {"ids": [e1, e2]},
        ).all()
    for row in rows:
        assert row.user_id == user_id
        assert row.demo_session_id is None
        assert row.expires_at is None

    # Jobs flipped too.
    with head_db.connect() as conn:
        job_rows = conn.execute(
            text(
                "SELECT id, user_id, demo_session_id FROM jobs WHERE id = ANY(:ids)"
            ),
            {"ids": [j1, j2]},
        ).all()
    for row in job_rows:
        assert row.user_id == user_id
        assert row.demo_session_id is None

    # Blob deletion never called — claim flow must not touch storage.
    delete_mock.assert_not_called()


@pytest.mark.asyncio
async def test_claim_is_idempotent(head_db):
    user_id = _insert_user(head_db)
    sid = "b" * 64
    _insert_demo_entry(head_db, session_id=sid)

    token = _build_claim_token(sid, datetime.now(timezone.utc) + timedelta(hours=1))
    app = _make_app_with_user(user_id)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp1 = await client.post(
            "/v1/entries/claim-demo-session", json={"claim_token": token}
        )
        resp2 = await client.post(
            "/v1/entries/claim-demo-session", json={"claim_token": token}
        )

    assert resp1.json()["claimed"] == 1
    assert resp2.json()["claimed"] == 0
    assert resp2.json()["entry_ids"] == []


@pytest.mark.asyncio
async def test_expired_claim_token_is_silent_noop(head_db):
    user_id = _insert_user(head_db)
    sid = "c" * 64
    _insert_demo_entry(head_db, session_id=sid)

    expired_token = _build_claim_token(
        sid, datetime.now(timezone.utc) - timedelta(seconds=1)
    )
    app = _make_app_with_user(user_id)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/v1/entries/claim-demo-session", json={"claim_token": expired_token}
        )

    assert resp.status_code == 200
    assert resp.json() == {"claimed": 0, "entry_ids": []}

    # Row must still be unowned — the no-op must not silently flip.
    with head_db.connect() as conn:
        row = conn.execute(
            text(
                "SELECT user_id, demo_session_id FROM entries "
                "WHERE demo_session_id = :s"
            ),
            {"s": sid},
        ).first()
    assert row is not None
    assert row.user_id is None
    assert row.demo_session_id == sid


@pytest.mark.asyncio
async def test_bad_signature_is_silent_noop(head_db):
    user_id = _insert_user(head_db)
    sid = "d" * 64
    _insert_demo_entry(head_db, session_id=sid)

    good_token = _build_claim_token(
        sid, datetime.now(timezone.utc) + timedelta(hours=1)
    )
    parts = good_token.split("|")
    bad_sig = ("0" if parts[2][0] != "0" else "1") + parts[2][1:]
    tampered = "|".join(parts[:2] + [bad_sig])

    app = _make_app_with_user(user_id)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/v1/entries/claim-demo-session", json={"claim_token": tampered}
        )
    assert resp.status_code == 200
    assert resp.json() == {"claimed": 0, "entry_ids": []}


@pytest.mark.asyncio
async def test_malformed_token_is_silent_noop(head_db):
    user_id = _insert_user(head_db)
    app = _make_app_with_user(user_id)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        for token in ["garbage", "no-pipes", "one|two", ""]:
            resp = await client.post(
                "/v1/entries/claim-demo-session", json={"claim_token": token}
            )
            assert resp.status_code == 200
            assert resp.json() == {"claimed": 0, "entry_ids": []}


@pytest.mark.asyncio
async def test_no_matching_rows_returns_zero(head_db):
    user_id = _insert_user(head_db)
    sid = "e" * 64
    # No entries inserted for this session — sweep already ran or a token
    # was issued and the visitor never recorded.
    token = _build_claim_token(sid, datetime.now(timezone.utc) + timedelta(hours=1))
    app = _make_app_with_user(user_id)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/v1/entries/claim-demo-session", json={"claim_token": token}
        )

    assert resp.status_code == 200
    assert resp.json() == {"claimed": 0, "entry_ids": []}


@pytest.mark.asyncio
async def test_claim_does_not_delete_blobs(head_db):
    """Blobs stay in place; only the row flips. Item 3 must NEVER call
    storage.delete_object inside the claim transaction."""
    user_id = _insert_user(head_db)
    sid = "f" * 64
    _insert_demo_entry(head_db, session_id=sid)
    token = _build_claim_token(sid, datetime.now(timezone.utc) + timedelta(hours=1))
    app = _make_app_with_user(user_id)

    with patch("app.services.storage.delete_object", AsyncMock()) as delete_mock:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/v1/entries/claim-demo-session", json={"claim_token": token}
            )
    assert resp.status_code == 200
    delete_mock.assert_not_called()


@pytest.mark.asyncio
async def test_auth_required(head_db):
    """No JWT → 401, even with a perfectly valid claim_token."""
    sid = "g" * 64
    token = _build_claim_token(sid, datetime.now(timezone.utc) + timedelta(hours=1))

    # Build the app WITHOUT overriding get_current_user. That dep enforces
    # OAuth2PasswordBearer, which 401s when no Authorization header is set.
    from app.routes.v1.claim import router as claim_router
    from app.db import get_db, async_session

    application = FastAPI()
    application.include_router(claim_router, prefix="/v1")

    async def _override_db():
        async with async_session() as s:
            yield s

    application.dependency_overrides[get_db] = _override_db

    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/v1/entries/claim-demo-session", json={"claim_token": token}
        )

    assert resp.status_code == 401
