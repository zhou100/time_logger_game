"""
Tests for the in-process rate limiter on /v1/public/demo/*.

Three buckets:
    per_ip_minute             — 5 req / 60s / hashed_ip — every endpoint
    submit_per_session_hour   — 3 successful /submit / 3600s / session_id
    submit_per_ip_day         — 10 successful /submit / 86400s / hashed_ip

Boundary verified for each. We exercise the limiter by directly calling
`_enforce_rate_limits`, which is the one entry point the routes share —
that gives us a deterministic, network-free test.
"""
from __future__ import annotations

import importlib
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("DEMO_CLAIM_HMAC_SECRET", "secret")
    monkeypatch.setenv("DEMO_IP_HASH_SALT", "salt")
    monkeypatch.setenv("PUBLIC_DEMO_ENABLED", "true")
    import app.settings as settings_mod
    settings_mod.get_settings.cache_clear()
    importlib.reload(settings_mod)
    import app.routes.public_demo as pd
    importlib.reload(pd)
    pd._reset_rate_state_for_tests()


def _fake_request():
    """Minimal Request stand-in — _enforce_rate_limits doesn't read it."""
    return MagicMock()


def test_per_ip_minute_trips_at_sixth_request():
    import app.routes.public_demo as pd
    req = _fake_request()
    ip = "ip-hash-A"
    for i in range(5):
        pd._enforce_rate_limits(req, hashed_ip=ip, session_id=None, kind="verify")
    with pytest.raises(HTTPException) as ei:
        pd._enforce_rate_limits(req, hashed_ip=ip, session_id=None, kind="verify")
    assert ei.value.status_code == 429
    assert ei.value.detail["error"] == "rate_limited"
    assert ei.value.detail["retry_after_seconds"] >= 1


def test_per_ip_minute_independent_per_ip():
    import app.routes.public_demo as pd
    req = _fake_request()
    for i in range(5):
        pd._enforce_rate_limits(req, hashed_ip="ip-A", session_id=None, kind="verify")
    # ip-B starts fresh — must not trip
    pd._enforce_rate_limits(req, hashed_ip="ip-B", session_id=None, kind="verify")


def test_submit_per_session_trips_at_fourth():
    """
    The per-session /submit limiter is recorded by the route on a
    successful enqueue. Simulate that by stuffing 3 events into the
    bucket, then assert the 4th `check` call trips.
    """
    import app.routes.public_demo as pd
    req = _fake_request()
    session = "s" * 64
    now = datetime.now(timezone.utc)
    with pd._RATE_LOCK:
        for _ in range(3):
            pd._RATE_BUCKETS["submit_per_session_hour"][session].append(
                now.timestamp()
            )
    # The 4th /submit must fail — independent IP so per_ip_minute is fresh.
    with pytest.raises(HTTPException) as ei:
        pd._enforce_rate_limits(
            req, hashed_ip="ip-fresh", session_id=session, kind="submit",
        )
    assert ei.value.status_code == 429


def test_submit_per_ip_day_trips_at_eleventh():
    """
    Stuff 10 events into submit_per_ip_day, then a fresh check trips.
    """
    import app.routes.public_demo as pd
    req = _fake_request()
    ip = "ip-day"
    now = datetime.now(timezone.utc)
    with pd._RATE_LOCK:
        for _ in range(10):
            pd._RATE_BUCKETS["submit_per_ip_day"][ip].append(now.timestamp())
    # Per-minute bucket is empty — only the day cap can trip.
    with pytest.raises(HTTPException) as ei:
        pd._enforce_rate_limits(
            req, hashed_ip=ip, session_id="sess-final", kind="submit",
        )
    assert ei.value.status_code == 429


def test_submit_under_limits_passes():
    """Sanity check: under all three caps the /submit flow doesn't raise."""
    import app.routes.public_demo as pd
    req = _fake_request()
    pd._enforce_rate_limits(
        req, hashed_ip="ip-low", session_id="sess-low", kind="submit",
    )


def test_rate_limit_error_shape():
    import app.routes.public_demo as pd
    req = _fake_request()
    ip = "ip-shape"
    for _ in range(5):
        pd._enforce_rate_limits(req, hashed_ip=ip, session_id=None, kind="verify")
    with pytest.raises(HTTPException) as ei:
        pd._enforce_rate_limits(req, hashed_ip=ip, session_id=None, kind="verify")
    assert ei.value.status_code == 429
    detail = ei.value.detail
    assert detail["error"] == "rate_limited"
    assert "retry_after_seconds" in detail


@pytest.mark.asyncio
async def test_submit_rate_limit_writes_log_row(monkeypatch):
    """
    End-to-end: trip the per_ip_minute limit on /submit and verify the
    DemoRequestLog row gets outcome="rate_limited".
    """
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient
    from unittest.mock import AsyncMock

    import app.routes.public_demo as pd
    pd._reset_rate_state_for_tests()
    application = FastAPI()
    application.include_router(pd.router)

    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db.execute = AsyncMock()

    from app.db import get_db

    async def _fake():
        yield db

    application.dependency_overrides[get_db] = _fake

    headers = {"cf-connecting-ip": "203.0.113.7", "cf-ray": "ray-1"}

    # Pre-fill the per-IP bucket so the first /submit immediately trips.
    now = datetime.now(timezone.utc)
    hashed_ip = pd.extract_hashed_ip
    # Manually push 5 events under the same hashed IP key
    from app.services.demo_ip import hash_ip
    key = hash_ip("203.0.113.7")
    with pd._RATE_LOCK:
        for _ in range(5):
            pd._RATE_BUCKETS["per_ip_minute"][key].append(now.timestamp())

    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/v1/public/demo/submit",
            json={"entry_id": "x", "permit_token": "y"},
            headers=headers,
        )

    assert resp.status_code == 429
    # demo_request_log row written with outcome rate_limited
    from app.models.demo import DemoRequestLog
    log_rows = [
        c.args[0] for c in db.add.call_args_list
        if isinstance(c.args[0], DemoRequestLog)
    ]
    assert log_rows and log_rows[0].outcome == "rate_limited"
