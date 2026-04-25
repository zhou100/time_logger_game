"""
Tests for POST /v1/public/demo/verify-turnstile.

Cloudflare call is mocked; we verify the permit_token HMAC shape and the
cookie flags the frontend will inherit.
"""
from __future__ import annotations

import importlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient


# Turnstile tests need a deterministic HMAC secret.
TEST_HMAC = "test-hmac-secret"
TEST_IP_SALT = "test-salt"


@pytest.fixture(autouse=True)
def _set_env(monkeypatch):
    monkeypatch.setenv("DEMO_CLAIM_HMAC_SECRET", TEST_HMAC)
    monkeypatch.setenv("DEMO_IP_HASH_SALT", TEST_IP_SALT)
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "turnstile-secret")
    monkeypatch.setenv("PUBLIC_DEMO_ENABLED", "true")
    import app.settings as settings_mod
    settings_mod.get_settings.cache_clear()
    importlib.reload(settings_mod)
    # Also reload the router module so it picks up the reloaded settings
    # singleton.
    import app.routes.public_demo as pd
    importlib.reload(pd)


@pytest.fixture
def app():
    import app.routes.public_demo as pd
    pd._reset_rate_state_for_tests()
    application = FastAPI()
    application.include_router(pd.router)
    return application


def _override_db(app_instance, db_mock):
    from app.db import get_db

    async def _fake_get_db():
        yield db_mock

    app_instance.dependency_overrides[get_db] = _fake_get_db


def _cf_ok():
    r = MagicMock()
    r.status_code = 200
    r.json = MagicMock(return_value={"success": True})
    return r


def _cf_fail():
    r = MagicMock()
    r.status_code = 200
    r.json = MagicMock(return_value={"success": False, "error-codes": ["bad-token"]})
    return r


def _mock_httpx(cf_response):
    """Patch httpx.AsyncClient so the Turnstile POST returns our mock."""
    client_instance = AsyncMock()
    client_instance.__aenter__ = AsyncMock(return_value=client_instance)
    client_instance.__aexit__ = AsyncMock(return_value=False)
    client_instance.post = AsyncMock(return_value=cf_response)
    return client_instance


def _make_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.execute = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_valid_turnstile_issues_permit_and_cookie(app):
    db = _make_db()
    _override_db(app, db)
    cf_client = _mock_httpx(_cf_ok())

    with patch("app.routes.public_demo.httpx.AsyncClient", return_value=cf_client):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/public/demo/verify-turnstile",
                json={"token": "cf-proof"},
                headers={
                    "cf-connecting-ip": "203.0.113.7",
                    "cf-ray": "ray-test",
                },
            )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "permit_token" in data
    # session|exp|uses|sig layout.
    assert data["permit_token"].count("|") == 3
    # session_id is 64 chars (hex).
    session_id, exp_iso, uses, _sig = data["permit_token"].split("|")
    assert len(session_id) == 64
    assert uses == "5"
    assert data["expires_at"] == exp_iso

    # Cookie set with HttpOnly + Secure + None (cross-site XHR from
    # frontend domain to backend domain).
    set_cookie = resp.headers.get("set-cookie", "")
    assert "tlg_demo_sid=" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "Secure" in set_cookie
    assert "samesite=none" in set_cookie.lower()
    assert "Max-Age=86400" in set_cookie


@pytest.mark.asyncio
async def test_failed_turnstile_returns_400(app):
    db = _make_db()
    _override_db(app, db)
    cf_client = _mock_httpx(_cf_fail())

    with patch("app.routes.public_demo.httpx.AsyncClient", return_value=cf_client):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/public/demo/verify-turnstile",
                json={"token": "bad"},
                headers={
                    "cf-connecting-ip": "203.0.113.7",
                    "cf-ray": "ray-test",
                },
            )

    assert resp.status_code == 400
    assert resp.json() == {"detail": {"error": "verification_failed"}}


@pytest.mark.asyncio
async def test_disabled_returns_404(monkeypatch):
    """PUBLIC_DEMO_ENABLED=false → 404 on every route."""
    monkeypatch.setenv("PUBLIC_DEMO_ENABLED", "false")
    import app.settings as settings_mod
    settings_mod.get_settings.cache_clear()
    importlib.reload(settings_mod)
    import app.routes.public_demo as pd
    importlib.reload(pd)
    pd._reset_rate_state_for_tests()

    application = FastAPI()
    application.include_router(pd.router)

    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/v1/public/demo/verify-turnstile",
            json={"token": "x"},
            headers={"cf-connecting-ip": "203.0.113.7", "cf-ray": "r"},
        )
        assert resp.status_code == 404
        resp2 = await client.post(
            "/api/v1/public/demo/presign",
            json={"content_type": "audio/webm"},
            headers={"cf-connecting-ip": "203.0.113.7", "cf-ray": "r"},
        )
        assert resp2.status_code == 404
        resp3 = await client.post(
            "/api/v1/public/demo/submit",
            json={"entry_id": "ignored", "permit_token": "x"},
            headers={"cf-connecting-ip": "203.0.113.7", "cf-ray": "r"},
        )
        assert resp3.status_code == 404
        resp4 = await client.get(
            "/api/v1/public/demo/status/00000000-0000-0000-0000-000000000000",
            headers={"cf-connecting-ip": "203.0.113.7", "cf-ray": "r"},
        )
        assert resp4.status_code == 404


@pytest.mark.asyncio
async def test_untrusted_origin_rejected(app):
    """No CF-Ray and no XFF → 400 untrusted_origin."""
    db = _make_db()
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/v1/public/demo/verify-turnstile", json={"token": "x"},
        )
    assert resp.status_code == 400
    assert resp.json() == {"detail": {"error": "untrusted_origin"}}
