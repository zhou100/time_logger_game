"""
Tests for the unauthenticated `/metrics` Prometheus scrape endpoint.

Asserts the basic shape (200, text/plain Prometheus format), that our
named instruments appear in the registry, and that an /submit call
increments `demo_submit_total{outcome="ok"}`.
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


from ._demo_helpers import demo_headers, make_anon_entry as _make_entry


def _trusted_headers(cookies=None):
    if not cookies:
        return demo_headers()
    h = demo_headers()
    h["cookie"] = "; ".join(f"{k}={v}" for k, v in cookies.items())
    return h


@pytest.mark.asyncio
async def test_metrics_endpoint_returns_prometheus_text():
    """GET /metrics → 200, text/plain, with our metric names visible."""
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/metrics")

    assert resp.status_code == 200, resp.text
    assert "text/plain" in resp.headers["content-type"]
    body = resp.text
    # Smoke test the metric names; HELP lines render even if no labels were
    # emitted yet.
    for name in (
        "demo_submit_total",
        "demo_cost_usd_today",
        "demo_whisper_latency_seconds",
        "demo_rate_limited_total",
        "demo_claims_total",
        "demo_sweep_expired_total",
        "demo_sweep_pruned_log_total",
    ):
        assert name in body, f"metric {name} missing from /metrics output"


@pytest.mark.asyncio
async def test_submit_increments_demo_submit_counter():
    """A successful /submit bumps demo_submit_total{outcome="ok"} by ≥1."""
    from app.main import app
    from app.routes.public_demo import _build_permit_token, _reset_rate_state_for_tests
    from app.services import metrics as metrics_svc

    _reset_rate_state_for_tests()

    session_id = "f" * 64
    permit = _build_permit_token(
        session_id, datetime.now(timezone.utc) + timedelta(hours=1), 5
    )
    entry_id = uuid.uuid4()

    # Build a stub db with the two execute() calls submit makes.
    entry = _make_entry(entry_id, session_id)
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    entry_result = MagicMock()
    entry_result.scalar_one_or_none = MagicMock(return_value=entry)
    cost_result = MagicMock()
    cost_result.scalar_one_or_none = MagicMock(return_value=0.0)
    db.execute = AsyncMock(side_effect=[entry_result, cost_result])

    from app.db import get_db

    async def _fake():
        yield db

    app.dependency_overrides[get_db] = _fake

    fake_job = MagicMock()
    fake_job.id = uuid.uuid4()

    # Snapshot the counter before; .inc() updates the registry mutably.
    before = metrics_svc.demo_submit_total.labels(outcome="ok")._value.get()

    try:
        with patch(
            "app.routes.public_demo.queue_svc.enqueue",
            AsyncMock(return_value=fake_job),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/api/v1/public/demo/submit",
                    json={"entry_id": str(entry_id), "permit_token": permit},
                    headers=_trusted_headers({"tlg_demo_sid": session_id}),
                )
        assert resp.status_code == 200, resp.text
    finally:
        app.dependency_overrides.pop(get_db, None)

    after = metrics_svc.demo_submit_total.labels(outcome="ok")._value.get()
    assert after >= before + 1
