"""
Tests for the new keyword-only signature on `services.queue.enqueue`.

Item 2 changed `enqueue(db, entry_id, user_id)` (positional) to
`enqueue(db, *, entry_id, user_id=None, demo_session_id=None)`. The
demo path passes `user_id=None, demo_session_id=...`; the authed path
keeps `user_id=current_user.id`.

These tests exercise both call shapes against an AsyncMock db and verify
the resulting Job carries the expected fields.
"""
from __future__ import annotations

import inspect
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.jobs import JobStatus
from app.services import queue as queue_svc


def _mock_db():
    db = AsyncMock()
    db.added = []
    db.add = lambda obj: db.added.append(obj)
    db.flush = AsyncMock()
    return db


def test_signature_is_keyword_only():
    """`db` is positional, the rest must be keyword-only."""
    sig = inspect.signature(queue_svc.enqueue)
    params = list(sig.parameters.values())
    # First param is `db` (positional-or-keyword), rest must be KEYWORD_ONLY.
    assert params[0].name == "db"
    for p in params[1:]:
        assert p.kind == inspect.Parameter.KEYWORD_ONLY, (
            f"{p.name} must be keyword-only; got {p.kind}"
        )
    # Defaults — user_id and demo_session_id default to None.
    by_name = {p.name: p for p in params}
    assert by_name["user_id"].default is None
    assert by_name["demo_session_id"].default is None


@pytest.mark.asyncio
async def test_enqueue_authed_path():
    db = _mock_db()
    entry_id = uuid.uuid4()

    job = await queue_svc.enqueue(db, entry_id=entry_id, user_id=42)

    assert job.entry_id == entry_id
    assert job.user_id == 42
    assert job.demo_session_id is None
    assert job.status == JobStatus.PENDING
    assert db.added == [job]


@pytest.mark.asyncio
async def test_enqueue_demo_path():
    db = _mock_db()
    entry_id = uuid.uuid4()
    session = "s" * 64

    job = await queue_svc.enqueue(
        db, entry_id=entry_id, user_id=None, demo_session_id=session,
    )

    assert job.entry_id == entry_id
    assert job.user_id is None
    assert job.demo_session_id == session
    assert job.status == JobStatus.PENDING


@pytest.mark.asyncio
async def test_enqueue_rejects_positional_user_id():
    """Old call shape `enqueue(db, entry_id, 42)` must raise."""
    db = _mock_db()
    with pytest.raises(TypeError):
        await queue_svc.enqueue(db, uuid.uuid4(), 42)  # type: ignore[arg-type]


def test_existing_call_sites_use_keyword_args():
    """
    Grep-equivalent assertion: the two known call sites — public_demo and
    v1/entries — pass `entry_id=` and `user_id=` as kwargs. Catches a
    regression where someone reverts to positional args.
    """
    import inspect as _inspect
    from app.routes import public_demo
    from app.routes.v1 import entries as v1_entries

    pd_src = _inspect.getsource(public_demo)
    en_src = _inspect.getsource(v1_entries)
    # Both files must call enqueue using kwargs only.
    assert "queue_svc.enqueue(" in pd_src
    assert "queue_svc.enqueue(" in en_src
    # Negative checks — no positional `enqueue(db, entry_id, user_id)`.
    # We look for the literal pattern `enqueue(db, entry_uuid,` which would
    # be the legacy 3-arg positional form.
    bad = "enqueue(db, entry_uuid,"
    assert bad not in pd_src or "user_id=" in pd_src
    assert bad not in en_src or "user_id=" in en_src
