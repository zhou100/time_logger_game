"""
Tests for POST /v1/public/demo/submit.

Covers permit + cookie matching, the cost-cap short-circuit, the normal
enqueue path (with `user_id=None, demo_session_id=...`), and the
demo_request_log row that gets written for every terminal path.
"""
from __future__ import annotations

import importlib
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.models.demo import DemoRequestLog
from app.models.entry import Entry


TEST_HMAC = "test-hmac-secret"
TEST_IP_SALT = "test-salt"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("DEMO_CLAIM_HMAC_SECRET", TEST_HMAC)
    monkeypatch.setenv("DEMO_IP_HASH_SALT", TEST_IP_SALT)
    monkeypatch.setenv("PUBLIC_DEMO_ENABLED", "true")
    monkeypatch.setenv("DAILY_DEMO_OPENAI_USD_CAP", "5.00")
    import app.settings as settings_mod
    settings_mod.get_settings.cache_clear()
    importlib.reload(settings_mod)
    import app.routes.public_demo as pd
    importlib.reload(pd)


@pytest.fixture
def app():
    import app.routes.public_demo as pd
    pd._reset_rate_state_for_tests()
    application = FastAPI()
    application.include_router(pd.router)
    return application


def _override_db(application, db):
    from app.db import get_db

    async def _fake():
        yield db

    application.dependency_overrides[get_db] = _fake


def _mk_permit(session_id, exp=None, uses=5):
    from app.routes.public_demo import _build_permit_token
    exp = exp or datetime.now(timezone.utc) + timedelta(hours=1)
    return _build_permit_token(session_id, exp, uses)


from ._demo_helpers import demo_headers, make_anon_entry as _make_entry


def _trusted_headers(cookies=None):
    if not cookies:
        return demo_headers()
    h = demo_headers()
    h["cookie"] = "; ".join(f"{k}={v}" for k, v in cookies.items())
    return h


def _db_with_entry(entry, *, current_cost: float = 0.0):
    """
    AsyncMock db whose execute() returns the entry on the lookup query
    and `current_cost` (Decimal-ish) on the cost peek.
    """
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()

    # Two execute() calls per submit: Entry lookup, then cost-counter peek.
    entry_result = MagicMock()
    entry_result.scalar_one_or_none = MagicMock(return_value=entry)

    cost_result = MagicMock()
    cost_result.scalar_one_or_none = MagicMock(return_value=current_cost)

    db.execute = AsyncMock(side_effect=[entry_result, cost_result])
    return db


@pytest.mark.asyncio
async def test_submit_happy_path_enqueues_and_logs(app):
    session_id = "a" * 64
    permit = _mk_permit(session_id)
    entry_id = uuid.uuid4()
    entry = _make_entry(entry_id, session_id)
    db = _db_with_entry(entry, current_cost=0.0)
    _override_db(app, db)

    fake_job = MagicMock()
    fake_job.id = uuid.uuid4()

    with patch(
        "app.routes.public_demo.queue_svc.enqueue",
        AsyncMock(return_value=fake_job),
    ) as enq:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/v1/public/demo/submit",
                json={"entry_id": str(entry_id), "permit_token": permit},
                headers=_trusted_headers({"tlg_demo_sid": session_id}),
            )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["entry_id"] == str(entry_id)
    assert body["job_id"] == str(fake_job.id)
    assert body.get("demo") is None

    # enqueue called with the new keyword args
    enq.assert_awaited_once()
    kwargs = enq.call_args.kwargs
    assert kwargs["user_id"] is None
    assert kwargs["demo_session_id"] == session_id
    assert kwargs["entry_id"] == entry_id

    # demo_request_log row added with outcome="ok"
    log_rows = [
        c.args[0] for c in db.add.call_args_list
        if isinstance(c.args[0], DemoRequestLog)
    ]
    assert len(log_rows) == 1
    assert log_rows[0].outcome == "ok"
    assert log_rows[0].demo_session_id == session_id


@pytest.mark.asyncio
async def test_submit_cost_capped_returns_fake_no_enqueue(app):
    """When today's spend already >= cap, return fake_output and skip enqueue."""
    session_id = "b" * 64
    permit = _mk_permit(session_id)
    entry_id = uuid.uuid4()
    entry = _make_entry(entry_id, session_id)
    # Match the env cap above (5.00)
    db = _db_with_entry(entry, current_cost=5.00)
    _override_db(app, db)

    with patch(
        "app.routes.public_demo.queue_svc.enqueue", AsyncMock()
    ) as enq:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/v1/public/demo/submit",
                json={"entry_id": str(entry_id), "permit_token": permit},
                headers=_trusted_headers({"tlg_demo_sid": session_id}),
            )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["demo"] == "capped"
    assert body["fake_output"]["summary"]
    assert body["fake_output"]["todos"]

    enq.assert_not_called()

    # Logged as "capped"
    log_rows = [
        c.args[0] for c in db.add.call_args_list
        if isinstance(c.args[0], DemoRequestLog)
    ]
    assert log_rows and log_rows[0].outcome == "capped"


@pytest.mark.asyncio
async def test_submit_session_mismatch_rejected(app):
    """Cookie session != permit session → 401, no enqueue."""
    session_a = "a" * 64
    session_b = "b" * 64
    permit = _mk_permit(session_a)
    entry_id = uuid.uuid4()
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    _override_db(app, db)

    with patch("app.routes.public_demo.queue_svc.enqueue", AsyncMock()) as enq:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/v1/public/demo/submit",
                json={"entry_id": str(entry_id), "permit_token": permit},
                headers=_trusted_headers({"tlg_demo_sid": session_b}),
            )
    assert resp.status_code == 401
    assert resp.json()["detail"]["error"] == "session_mismatch"
    enq.assert_not_called()


@pytest.mark.asyncio
async def test_submit_unknown_entry_returns_404(app):
    session_id = "c" * 64
    permit = _mk_permit(session_id)
    entry_id = uuid.uuid4()
    # Entry lookup returns None
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    miss = MagicMock()
    miss.scalar_one_or_none = MagicMock(return_value=None)
    db.execute = AsyncMock(return_value=miss)
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/v1/public/demo/submit",
            json={"entry_id": str(entry_id), "permit_token": permit},
            headers=_trusted_headers({"tlg_demo_sid": session_id}),
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_submit_invalid_entry_id_400(app):
    session_id = "d" * 64
    permit = _mk_permit(session_id)
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.execute = AsyncMock()
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/v1/public/demo/submit",
            json={"entry_id": "not-a-uuid", "permit_token": permit},
            headers=_trusted_headers({"tlg_demo_sid": session_id}),
        )
    assert resp.status_code == 400
