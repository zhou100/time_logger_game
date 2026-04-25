"""
End-to-end style observability tests for the public-demo /submit seam.

Verifies that PostHog `capture_demo_event` is invoked AND the matching
Prometheus counter is incremented for each terminal outcome:
  - ok
  - capped
  - rate_limited

PostHog is mocked at `app.routes.public_demo.analytics_svc.capture_demo_event`
so we can assert event names + properties without touching the network.
"""
from __future__ import annotations

import importlib
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.models.entry import Entry


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("DEMO_CLAIM_HMAC_SECRET", "test-hmac-secret")
    monkeypatch.setenv("DEMO_IP_HASH_SALT", "test-salt")
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


def _trusted_headers(cookies=None):
    h = {"cf-connecting-ip": "203.0.113.7", "cf-ray": "ray-1"}
    if cookies:
        h["cookie"] = "; ".join(f"{k}={v}" for k, v in cookies.items())
    return h


def _make_entry(entry_id, session_id):
    e = MagicMock(spec=Entry)
    e.id = entry_id
    e.user_id = None
    e.demo_session_id = session_id
    return e


def _db_with_entry(entry, *, current_cost: float = 0.0):
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    entry_result = MagicMock()
    entry_result.scalar_one_or_none = MagicMock(return_value=entry)
    cost_result = MagicMock()
    cost_result.scalar_one_or_none = MagicMock(return_value=current_cost)
    db.execute = AsyncMock(side_effect=[entry_result, cost_result])
    return db


def _ok_event_calls(mock_capture, event_name: str):
    return [c for c in mock_capture.call_args_list if c.args[0] == event_name]


@pytest.mark.asyncio
async def test_submit_ok_emits_event_and_metric(app):
    from app.services import metrics as metrics_svc

    session_id = "0" * 64
    permit = _mk_permit(session_id)
    entry_id = uuid.uuid4()
    entry = _make_entry(entry_id, session_id)
    db = _db_with_entry(entry, current_cost=0.0)
    _override_db(app, db)

    fake_job = MagicMock()
    fake_job.id = uuid.uuid4()

    before = metrics_svc.demo_submit_total.labels(outcome="ok")._value.get()

    with patch(
        "app.routes.public_demo.queue_svc.enqueue",
        AsyncMock(return_value=fake_job),
    ), patch(
        "app.routes.public_demo.analytics_svc.capture_demo_event"
    ) as mock_capture:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/v1/public/demo/submit",
                json={"entry_id": str(entry_id), "permit_token": permit},
                headers=_trusted_headers({"tlg_demo_sid": session_id}),
            )
    assert resp.status_code == 200, resp.text

    submit_calls = _ok_event_calls(mock_capture, "demo_submit")
    assert len(submit_calls) == 1
    props = submit_calls[0].kwargs.get("properties") or submit_calls[0].args[2]
    assert props["outcome"] == "ok"
    assert props["entry_id"] == str(entry_id)
    assert "hashed_ip" in props

    after = metrics_svc.demo_submit_total.labels(outcome="ok")._value.get()
    assert after == before + 1


@pytest.mark.asyncio
async def test_submit_capped_emits_event_and_metric(app):
    from app.services import metrics as metrics_svc

    session_id = "1" * 64
    permit = _mk_permit(session_id)
    entry_id = uuid.uuid4()
    entry = _make_entry(entry_id, session_id)
    db = _db_with_entry(entry, current_cost=5.00)
    _override_db(app, db)

    before = metrics_svc.demo_submit_total.labels(outcome="capped")._value.get()

    with patch(
        "app.routes.public_demo.queue_svc.enqueue", AsyncMock()
    ) as enq, patch(
        "app.routes.public_demo.analytics_svc.capture_demo_event"
    ) as mock_capture:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/v1/public/demo/submit",
                json={"entry_id": str(entry_id), "permit_token": permit},
                headers=_trusted_headers({"tlg_demo_sid": session_id}),
            )
    assert resp.status_code == 200, resp.text
    assert resp.json()["demo"] == "capped"
    enq.assert_not_called()

    submit_calls = _ok_event_calls(mock_capture, "demo_submit")
    assert len(submit_calls) == 1
    props = submit_calls[0].kwargs.get("properties") or submit_calls[0].args[2]
    assert props["outcome"] == "capped"

    after = metrics_svc.demo_submit_total.labels(outcome="capped")._value.get()
    assert after == before + 1


@pytest.mark.asyncio
async def test_submit_rate_limited_emits_event_and_metric(app):
    """
    Saturate the per_ip_minute bucket so the next submit trips 429 and we
    can assert the rate-limited path emits a `demo_submit{outcome:rate_limited}`
    event AND increments demo_rate_limited_total{limiter}.
    """
    # The `app` fixture already reloaded app.routes.public_demo and reset
    # the in-process rate buckets. Touch the module by name (not the
    # pre-fixture import) so our writes go into the same dict the route
    # reads from.
    import app.routes.public_demo as pd
    from app.services import metrics as metrics_svc

    session_id = "2" * 64
    permit = pd._build_permit_token(
        session_id, datetime.now(timezone.utc) + timedelta(hours=1), 5
    )
    entry_id = uuid.uuid4()
    entry = _make_entry(entry_id, session_id)
    db = _db_with_entry(entry, current_cost=0.0)
    _override_db(app, db)

    # Pre-fill per_ip_minute to its limit so the next call trips. Compute
    # the same hashed key the route will compute — through the live
    # `hash_ip` helper so the value tracks whatever salt is actually
    # loaded into the imported `app.services.demo_ip` module.
    from app.services.demo_ip import hash_ip
    hashed_ip_for_test = hash_ip("203.0.113.7")
    now = datetime.now(timezone.utc)
    for _ in range(pd._RATE_RULES["per_ip_minute"][1]):
        pd._record_rate("per_ip_minute", hashed_ip_for_test, now)

    before_rl_total = metrics_svc.demo_submit_total.labels(
        outcome="rate_limited"
    )._value.get()
    before_rl_per_ip = metrics_svc.demo_rate_limited_total.labels(
        limiter="per_ip_minute"
    )._value.get()

    with patch.object(pd.analytics_svc, "capture_demo_event") as mock_capture:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/v1/public/demo/submit",
                json={"entry_id": str(entry_id), "permit_token": permit},
                headers=_trusted_headers({"tlg_demo_sid": session_id}),
            )
    assert resp.status_code == 429, resp.text

    submit_calls = _ok_event_calls(mock_capture, "demo_submit")
    assert len(submit_calls) == 1
    props = submit_calls[0].kwargs.get("properties") or submit_calls[0].args[2]
    assert props["outcome"] == "rate_limited"
    assert props["limiter"] == "per_ip_minute"

    after_rl_total = metrics_svc.demo_submit_total.labels(
        outcome="rate_limited"
    )._value.get()
    after_rl_per_ip = metrics_svc.demo_rate_limited_total.labels(
        limiter="per_ip_minute"
    )._value.get()
    assert after_rl_total == before_rl_total + 1
    assert after_rl_per_ip == before_rl_per_ip + 1
