"""
Tests for POST /v1/public/demo/presign.

Covers permit validation (tamper, expired, exhausted, session mismatch),
content-type gating, Entry row creation shape, and HMAC-verifiability of
the returned claim_token.
"""
from __future__ import annotations

import importlib
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient


TEST_HMAC = "test-hmac-secret"
TEST_IP_SALT = "test-salt"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("DEMO_CLAIM_HMAC_SECRET", TEST_HMAC)
    monkeypatch.setenv("DEMO_IP_HASH_SALT", TEST_IP_SALT)
    monkeypatch.setenv("PUBLIC_DEMO_ENABLED", "true")
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


def _db():
    d = AsyncMock()
    d.add = MagicMock()
    d.flush = AsyncMock()
    d.commit = AsyncMock()
    d.execute = AsyncMock()
    return d


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


@pytest.mark.asyncio
async def test_presign_happy_path(app):
    session_id = "a" * 64
    permit = _mk_permit(session_id)
    db = _db()
    _override_db(app, db)

    with patch(
        "app.routes.public_demo.storage_svc.generate_presigned_put",
        AsyncMock(return_value="https://storage.test/put"),
    ) as gp:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/v1/public/demo/presign",
                json={"content_type": "audio/webm", "permit_token": permit},
                headers=_trusted_headers({"tlg_demo_sid": session_id}),
            )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["content_type"] == "audio/webm"
    assert data["upload_url"] == "https://storage.test/put"
    assert data["permit_token"].count("|") == 3
    # Uses decremented: initial 5 → 4
    assert data["permit_token"].split("|")[2] == "4"
    assert data["claim_token"].count("|") == 2  # session|exp|sig

    # Entry was added with expected shape
    added_entries = [c for c in db.add.call_args_list]
    assert added_entries, "expected Entry.add to be called"
    entry_obj = added_entries[0].args[0]
    assert entry_obj.user_id is None
    assert entry_obj.demo_session_id == session_id
    assert entry_obj.raw_audio_key.startswith(f"anonymous-demo/{session_id}/")
    assert entry_obj.raw_audio_key.endswith(".webm")
    assert entry_obj.expires_at > datetime.now(timezone.utc)
    # Presign called with the derived key + content_type
    gp.assert_awaited_once()
    called_args = gp.call_args.args
    assert called_args[0] == entry_obj.raw_audio_key
    assert called_args[1] == "audio/webm"


@pytest.mark.asyncio
async def test_presign_expired_permit_rejected(app):
    session_id = "b" * 64
    expired = datetime.now(timezone.utc) - timedelta(minutes=1)
    permit = _mk_permit(session_id, exp=expired)
    db = _db()
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/v1/public/demo/presign",
            json={"content_type": "audio/webm", "permit_token": permit},
            headers=_trusted_headers({"tlg_demo_sid": session_id}),
        )
    assert resp.status_code == 401
    assert resp.json()["detail"]["error"] == "permit_expired"


@pytest.mark.asyncio
async def test_presign_exhausted_permit_rejected(app):
    session_id = "c" * 64
    permit = _mk_permit(session_id, uses=0)
    db = _db()
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/v1/public/demo/presign",
            json={"content_type": "audio/webm", "permit_token": permit},
            headers=_trusted_headers({"tlg_demo_sid": session_id}),
        )
    assert resp.status_code == 401
    assert resp.json()["detail"]["error"] == "permit_exhausted"


@pytest.mark.asyncio
async def test_presign_session_mismatch_rejected(app):
    """Permit bound to session A, cookie says session B."""
    session_a = "a" * 64
    session_b = "b" * 64
    permit = _mk_permit(session_a)
    db = _db()
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/v1/public/demo/presign",
            json={"content_type": "audio/webm", "permit_token": permit},
            headers=_trusted_headers({"tlg_demo_sid": session_b}),
        )
    assert resp.status_code == 401
    assert resp.json()["detail"]["error"] == "session_mismatch"


@pytest.mark.asyncio
async def test_presign_no_cookie_rejected(app):
    """Cookie-less presign gets session_mismatch."""
    session_id = "d" * 64
    permit = _mk_permit(session_id)
    db = _db()
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/v1/public/demo/presign",
            json={"content_type": "audio/webm", "permit_token": permit},
            headers=_trusted_headers(),  # no cookie
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_presign_rejects_bad_content_type(app):
    session_id = "e" * 64
    permit = _mk_permit(session_id)
    db = _db()
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/v1/public/demo/presign",
            json={"content_type": "video/mp4", "permit_token": permit},
            headers=_trusted_headers({"tlg_demo_sid": session_id}),
        )
    assert resp.status_code == 400
    assert resp.json()["detail"]["error"] == "unsupported_content_type"


@pytest.mark.asyncio
@pytest.mark.parametrize("ct,ext", [
    ("audio/webm", ".webm"),
    ("audio/mp4", ".mp4"),
    ("audio/m4a", ".m4a"),
    ("audio/mpeg", ".mp3"),
])
async def test_presign_extension_matches_content_type(app, ct, ext):
    session_id = "f" * 64
    permit = _mk_permit(session_id)
    db = _db()
    _override_db(app, db)

    with patch(
        "app.routes.public_demo.storage_svc.generate_presigned_put",
        AsyncMock(return_value="https://x"),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/v1/public/demo/presign",
                json={"content_type": ct, "permit_token": permit},
                headers=_trusted_headers({"tlg_demo_sid": session_id}),
            )
    assert resp.status_code == 200
    entry_obj = db.add.call_args_list[0].args[0]
    assert entry_obj.raw_audio_key.endswith(ext)


@pytest.mark.asyncio
async def test_claim_token_is_hmac_verifiable(app):
    session_id = "g" * 64
    permit = _mk_permit(session_id)
    db = _db()
    _override_db(app, db)

    with patch(
        "app.routes.public_demo.storage_svc.generate_presigned_put",
        AsyncMock(return_value="https://x"),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/v1/public/demo/presign",
                json={"content_type": "audio/webm", "permit_token": permit},
                headers=_trusted_headers({"tlg_demo_sid": session_id}),
            )
    data = resp.json()
    claim = data["claim_token"]
    parts = claim.split("|")
    assert len(parts) == 3
    sid, exp_iso, sig = parts
    assert sid == session_id

    import hashlib, hmac
    expected = hmac.new(
        TEST_HMAC.encode(),
        f"{sid}|{exp_iso}".encode(),
        hashlib.sha256,
    ).hexdigest()
    assert hmac.compare_digest(sig, expected)


@pytest.mark.asyncio
async def test_presign_tampered_permit_rejected(app):
    session_id = "h" * 64
    permit = _mk_permit(session_id)
    # Flip the signature character.
    parts = permit.split("|")
    bad_sig = ("0" if parts[3][0] != "0" else "1") + parts[3][1:]
    tampered = "|".join(parts[:3] + [bad_sig])
    db = _db()
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/v1/public/demo/presign",
            json={"content_type": "audio/webm", "permit_token": tampered},
            headers=_trusted_headers({"tlg_demo_sid": session_id}),
        )
    assert resp.status_code == 401
    assert resp.json()["detail"]["error"] == "invalid_permit"
