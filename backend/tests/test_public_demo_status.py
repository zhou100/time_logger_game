"""
Tests for GET /v1/public/demo/status/{entry_id}.

Exercises cookie-gated lookup, the mechanical summary derivation, the
demo_teaser surface from EntryMetadata, and the queued/done step states.
"""
from __future__ import annotations

import importlib
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.models.classification import EntryClassification
from app.models.entry import Entry
from app.models.entry_metadata import EntryMetadata
from app.models.jobs import Job, JobStatus


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


def _override_db(application, db):
    from app.db import get_db

    async def _fake():
        yield db

    application.dependency_overrides[get_db] = _fake


from ._demo_helpers import demo_headers, make_anon_entry as _entry


def _trusted_headers(cookies=None):
    if not cookies:
        return demo_headers()
    h = demo_headers()
    h["cookie"] = "; ".join(f"{k}={v}" for k, v in cookies.items())
    return h


def _result(scalar=None, scalars=None):
    """Tiny helper to fake an SQLAlchemy result."""
    r = MagicMock()
    r.scalar_one_or_none = MagicMock(return_value=scalar)
    if scalars is not None:
        scalars_obj = MagicMock()
        scalars_obj.all = MagicMock(return_value=scalars)
        r.scalars = MagicMock(return_value=scalars_obj)
    return r


def _classification(category, text, order):
    c = MagicMock(spec=EntryClassification)
    c.category = category
    c.extracted_text = text
    c.edited_text = None
    c.display_order = order
    return c


@pytest.mark.asyncio
async def test_status_cookie_mismatch_returns_404(app):
    entry_id = uuid.uuid4()
    session_a = "a" * 64
    session_b = "b" * 64
    entry = _entry(entry_id, session_a)
    db = AsyncMock()
    # First execute() returns entry; cookie says session_b → 404 before more
    # queries run.
    db.execute = AsyncMock(side_effect=[_result(scalar=entry)])
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(
            f"/v1/public/demo/status/{entry_id}",
            headers=_trusted_headers({"tlg_demo_sid": session_b}),
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_status_no_cookie_returns_404(app):
    entry_id = uuid.uuid4()
    session_id = "a" * 64
    entry = _entry(entry_id, session_id)
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_result(scalar=entry)])
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(
            f"/v1/public/demo/status/{entry_id}",
            headers=_trusted_headers(),  # no cookie
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_status_invalid_uuid_returns_404(app):
    db = AsyncMock()
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(
            "/v1/public/demo/status/not-a-uuid",
            headers=_trusted_headers({"tlg_demo_sid": "a" * 64}),
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_status_queued_no_job(app):
    """No Job row yet → step='queued', no summary, empty classifications."""
    entry_id = uuid.uuid4()
    session_id = "a" * 64
    entry = _entry(entry_id, session_id, transcript=None)
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _result(scalar=entry),         # entry lookup
        _result(scalar=None),          # job lookup → none
        _result(scalars=[]),           # classifications
        _result(scalar=None),          # entry metadata teaser
    ])
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(
            f"/v1/public/demo/status/{entry_id}",
            headers=_trusted_headers({"tlg_demo_sid": session_id}),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["step"] == "queued"
    assert data["transcript"] is None
    assert data["classifications"] == []
    assert data["summary"] is None
    assert data["demo_teaser"] is None


@pytest.mark.asyncio
async def test_status_done_with_mechanical_summary(app):
    """Done job + classifications → derived summary mentions categories."""
    entry_id = uuid.uuid4()
    session_id = "a" * 64
    entry = _entry(entry_id, session_id, transcript="went on a walk and emailed a vendor")

    job = MagicMock(spec=Job)
    job.id = uuid.uuid4()
    job.status = JobStatus.DONE
    job.step = "complete"

    rows = [
        _classification("REFLECTION", "went on a walk", 0),
        _classification("TODO", "email vendor", 1),
        _classification("REFLECTION", "felt good", 2),
    ]

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _result(scalar=entry),
        _result(scalar=job),
        _result(scalars=rows),
        _result(scalar=None),  # no teaser metadata
    ])
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(
            f"/v1/public/demo/status/{entry_id}",
            headers=_trusted_headers({"tlg_demo_sid": session_id}),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["step"] == "done"
    # summary references the distinct category labels
    assert data["summary"] is not None
    assert "reflection" in data["summary"].lower()
    assert "todo" in data["summary"].lower()
    # 1 todo, 2 key points (REFLECTION counts toward key_points)
    assert "1 todo" in data["summary"]
    assert "2 key point" in data["summary"]
    assert len(data["classifications"]) == 3


@pytest.mark.asyncio
async def test_status_demo_teaser_dict_value(app):
    """Teaser stored as {'text': '...'} surfaces under demo_teaser."""
    entry_id = uuid.uuid4()
    session_id = "a" * 64
    entry = _entry(entry_id, session_id)

    job = MagicMock(spec=Job)
    job.id = uuid.uuid4()
    job.status = JobStatus.DONE
    job.step = "complete"

    teaser_meta = MagicMock(spec=EntryMetadata)
    teaser_meta.value = {"text": "you mentioned 'walk' twice"}

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _result(scalar=entry),
        _result(scalar=job),
        _result(scalars=[]),
        _result(scalar=teaser_meta),
    ])
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(
            f"/v1/public/demo/status/{entry_id}",
            headers=_trusted_headers({"tlg_demo_sid": session_id}),
        )
    assert resp.status_code == 200
    assert resp.json()["demo_teaser"] == "you mentioned 'walk' twice"


@pytest.mark.asyncio
async def test_status_demo_teaser_string_value(app):
    """Teaser stored as a bare string surfaces under demo_teaser."""
    entry_id = uuid.uuid4()
    session_id = "a" * 64
    entry = _entry(entry_id, session_id)

    job = MagicMock(spec=Job)
    job.id = uuid.uuid4()
    job.status = JobStatus.DONE
    job.step = "complete"

    teaser_meta = MagicMock(spec=EntryMetadata)
    teaser_meta.value = "bare string teaser"

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _result(scalar=entry),
        _result(scalar=job),
        _result(scalars=[]),
        _result(scalar=teaser_meta),
    ])
    _override_db(app, db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(
            f"/v1/public/demo/status/{entry_id}",
            headers=_trusted_headers({"tlg_demo_sid": session_id}),
        )
    assert resp.status_code == 200
    assert resp.json()["demo_teaser"] == "bare string teaser"
