"""
Tests for the worker's `demo_teaser` write — the single delta added in
item 3 of the interaction-first-landing series.

The teaser delta runs only:
  - on demo jobs (user_id=None AND demo_session_id set),
  - when FLYWHEEL_ENABLED is true,
  - when there are >=2 completed entries in the session,
  - when `compute_teaser` returns a non-None stem.

Failure to compute or write must NOT fail the job — the helper opens its
own session and swallows its own exceptions.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.entry import Entry
from app.models.entry_metadata import EntryMetadata
from app.models.jobs import Job, JobStatus


def _make_entry(user_id, *, transcript="some transcript"):
    e = MagicMock(spec=Entry)
    e.id = uuid.uuid4()
    e.user_id = user_id
    e.raw_audio_key = (
        f"anonymous-demo/sess/{e.id}.webm"
        if user_id is None
        else f"audio/{user_id}/test.webm"
    )
    e.transcript = transcript
    e.duration_seconds = 30
    return e


def _make_job(*, entry_id, user_id, demo_session_id=None):
    j = MagicMock(spec=Job)
    j.id = uuid.uuid4()
    j.entry_id = entry_id
    j.user_id = user_id
    j.demo_session_id = demo_session_id
    j.status = JobStatus.PROCESSING
    return j


def _mock_db(entry):
    db = AsyncMock()
    db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=entry))
    )
    db.added = []
    db.add = lambda obj: db.added.append(obj)
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    return db


def _mock_openai_with_text(text="some transcript"):
    transcript_mock = MagicMock()
    transcript_mock.text = text
    openai_mock = MagicMock()
    openai_mock.return_value.audio.transcriptions.create = AsyncMock(
        return_value=transcript_mock
    )
    return openai_mock


async def _run_process_job(
    db, job, cat_results, *, debit_mock=None, teaser_mock=None
):
    queue_mock = MagicMock(
        mark_step=AsyncMock(),
        complete_job=AsyncMock(),
        fail_job=AsyncMock(),
    )
    storage_mock = MagicMock(download_bytes=AsyncMock(return_value=b"audio"))
    debit_patch = debit_mock if debit_mock is not None else AsyncMock()
    teaser_patch = teaser_mock if teaser_mock is not None else AsyncMock()

    with patch("app.services.worker.queue_svc", queue_mock), \
         patch("app.services.worker.storage_svc", storage_mock), \
         patch(
             "app.services.worker.categorize_text",
             AsyncMock(return_value=cat_results),
         ), \
         patch(
             "app.services.worker.refine_transcript",
             AsyncMock(return_value="refined"),
         ), \
         patch(
             "app.services.worker._get_openai", _mock_openai_with_text(),
         ), \
         patch("app.services.worker._debit_demo_cost", debit_patch), \
         patch(
             "app.services.worker._maybe_write_demo_teaser", teaser_patch,
         ), \
         patch("app.services.worker.tempfile.NamedTemporaryFile") as mock_tmp, \
         patch("app.services.worker.os.unlink"), \
         patch("builtins.open", MagicMock()):
        mock_tmp.return_value.__enter__ = MagicMock(
            return_value=MagicMock(name="t.webm")
        )
        mock_tmp.return_value.__exit__ = MagicMock(return_value=False)
        from app.services.worker import _process_job
        await _process_job(db, job)


# ── _process_job-level: teaser hook is called only on demo path ───────────────

@pytest.mark.asyncio
async def test_authed_job_does_not_call_teaser_helper():
    """Authed pipeline must not even attempt teaser compute — keeps the
    authed path's behavior bit-identical to before this change."""
    cat_results = [{"text": "shipped feature", "category": "EARNING"}]
    entry = _make_entry(user_id=42)
    job = _make_job(entry_id=entry.id, user_id=42)
    db = _mock_db(entry)
    teaser_mock = AsyncMock()

    await _run_process_job(db, job, cat_results, teaser_mock=teaser_mock)

    teaser_mock.assert_not_called()


@pytest.mark.asyncio
async def test_demo_job_calls_teaser_helper_with_session_id():
    """Demo job (user_id=None, demo_session_id set) must invoke the helper
    with the right keyword args."""
    cat_results = [{"text": "todo: thing", "category": "TODO"}]
    entry = _make_entry(user_id=None)
    job = _make_job(
        entry_id=entry.id, user_id=None, demo_session_id="sess-teaser",
    )
    db = _mock_db(entry)
    teaser_mock = AsyncMock()

    await _run_process_job(db, job, cat_results, teaser_mock=teaser_mock)

    teaser_mock.assert_awaited_once()
    kwargs = teaser_mock.call_args.kwargs
    assert kwargs["demo_session_id"] == "sess-teaser"
    assert kwargs["current_entry_id"] == entry.id


# ── helper-level: gating by FLYWHEEL + 2-entry threshold + write shape ───────

@pytest.mark.asyncio
async def test_first_demo_entry_does_not_write_teaser():
    """Helper sees only one completed entry — no metadata written."""
    from app.services import worker as worker_mod

    entry_id = uuid.uuid4()

    e1 = MagicMock(spec=Entry)
    e1.id = entry_id
    e1.transcript = "Focused on the work today."

    fake_session = _make_fake_session(rows=[e1])

    with patch.object(worker_mod.settings, "FLYWHEEL_ENABLED", True), \
         patch("app.services.worker.async_session", lambda: fake_session):
        await worker_mod._maybe_write_demo_teaser(
            demo_session_id="s1", current_entry_id=entry_id,
        )

    assert not any(isinstance(o, EntryMetadata) for o in fake_session.added)


@pytest.mark.asyncio
async def test_second_demo_entry_with_repeating_stem_writes_teaser():
    """Two entries, both with 'focused'/'focusing' → teaser written."""
    from app.services import worker as worker_mod

    e1 = MagicMock(spec=Entry)
    e1.id = uuid.uuid4()
    e1.transcript = "I was really focused on the work today."

    e2 = MagicMock(spec=Entry)
    e2.id = uuid.uuid4()
    e2.transcript = "Focusing on shipping again."

    fake_session = _make_fake_session(rows=[e1, e2])

    with patch.object(worker_mod.settings, "FLYWHEEL_ENABLED", True), \
         patch("app.services.worker.async_session", lambda: fake_session):
        await worker_mod._maybe_write_demo_teaser(
            demo_session_id="s2", current_entry_id=e2.id,
        )

    metas = [o for o in fake_session.added if isinstance(o, EntryMetadata)]
    assert len(metas) == 1
    meta = metas[0]
    assert meta.entry_id == e2.id
    assert meta.key == "demo_teaser"
    # Status endpoint reads value["text"]; tests assert that contract.
    assert isinstance(meta.value, dict)
    assert "focus" in meta.value.get("stem", "")
    assert meta.value.get("text", "").startswith("You mentioned")


@pytest.mark.asyncio
async def test_flywheel_disabled_skips_write():
    """FLYWHEEL_ENABLED=false → no metadata even when the input would
    otherwise produce a teaser."""
    from app.services import worker as worker_mod

    e1 = MagicMock(spec=Entry)
    e1.id = uuid.uuid4()
    e1.transcript = "Focused on the work."
    e2 = MagicMock(spec=Entry)
    e2.id = uuid.uuid4()
    e2.transcript = "Focusing again."

    fake_session = _make_fake_session(rows=[e1, e2])

    with patch.object(worker_mod.settings, "FLYWHEEL_ENABLED", False), \
         patch("app.services.worker.async_session", lambda: fake_session):
        await worker_mod._maybe_write_demo_teaser(
            demo_session_id="s3", current_entry_id=e2.id,
        )

    assert fake_session.added == []


@pytest.mark.asyncio
async def test_compute_teaser_raises_does_not_propagate():
    """If compute_teaser somehow raises, the helper logs and returns —
    job continues to succeed."""
    from app.services import worker as worker_mod

    e1 = MagicMock(spec=Entry)
    e1.id = uuid.uuid4()
    e1.transcript = "x"
    e2 = MagicMock(spec=Entry)
    e2.id = uuid.uuid4()
    e2.transcript = "y"

    fake_session = _make_fake_session(rows=[e1, e2])

    with patch.object(worker_mod.settings, "FLYWHEEL_ENABLED", True), \
         patch("app.services.worker.async_session", lambda: fake_session), \
         patch(
             "app.services.worker.compute_teaser",
             side_effect=RuntimeError("boom"),
         ):
        # Must not raise.
        await worker_mod._maybe_write_demo_teaser(
            demo_session_id="s4", current_entry_id=e2.id,
        )

    assert fake_session.added == []


# ── helpers ─────────────────────────────────────────────────────────────────

def _make_fake_session(rows):
    """Build an async-context-manager fake that .execute() returns the
    given Entry rows from. Used to simulate the dedicated cost/teaser
    session opened inside `_maybe_write_demo_teaser`."""
    class _Result:
        def scalars(self):
            inner = self
            class _Inner:
                def all(self_inner):
                    return rows
            return _Inner()

    class _Session:
        def __init__(self):
            self.added = []
            self.executed = []

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def execute(self, stmt):
            self.executed.append(stmt)
            return _Result()

        def add(self, obj):
            self.added.append(obj)

        async def commit(self):
            pass

        async def flush(self):
            pass

    return _Session()
