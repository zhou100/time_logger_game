"""
Tests for worker anonymous-demo safety + cost-debit deltas (item 2 § 4).

Two surgical changes are validated:

1. **Notification skip when user_id is None.** Demo jobs (user_id=None)
   must never write a Notification row — `notifications.user_id` is NOT
   nullable, so an unguarded write would raise on FK insert. Authed jobs
   keep the existing notification write.

2. **Post-Whisper cost debit.** When `job.demo_session_id` is set, the
   worker debits the actual OpenAI cost into `demo_cost_counter` under a
   `SELECT ... FOR UPDATE` row lock and stamps `whisper_ms` +
   `total_cost_usd` onto the most-recent demo_request_log row for that
   session.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.classification import EntryClassification
from app.models.entry import Entry
from app.models.jobs import Job, JobStatus
from app.models.notification import Notification


# ── Helpers (mirrors test_worker_multi_entry style) ──────────────────────────

def _make_entry(user_id, transcript="test transcript"):
    e = MagicMock(spec=Entry)
    e.id = uuid.uuid4()
    e.user_id = user_id
    e.raw_audio_key = f"anonymous-demo/abc/{e.id}.webm" if user_id is None else f"audio/{user_id}/test.webm"
    e.transcript = transcript
    e.duration_seconds = 60
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


def _mock_openai():
    transcript_mock = MagicMock()
    transcript_mock.text = "some transcript"
    openai_mock = MagicMock()
    openai_mock.return_value.audio.transcriptions.create = AsyncMock(
        return_value=transcript_mock
    )
    return openai_mock


async def _run_process_job(db, job, cat_results, *, debit_mock=None):
    queue_mock = MagicMock(
        mark_step=AsyncMock(),
        complete_job=AsyncMock(),
        fail_job=AsyncMock(),
    )
    storage_mock = MagicMock(download_bytes=AsyncMock(return_value=b"audio"))
    debit_patch = (
        debit_mock if debit_mock is not None else AsyncMock()
    )

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
         patch("app.services.worker._get_openai", _mock_openai()), \
         patch("app.services.worker._debit_demo_cost", debit_patch), \
         patch("app.services.worker.tempfile.NamedTemporaryFile") as mock_tmp, \
         patch("app.services.worker.os.unlink"), \
         patch("builtins.open", MagicMock()):
        mock_tmp.return_value.__enter__ = MagicMock(
            return_value=MagicMock(name="t.webm")
        )
        mock_tmp.return_value.__exit__ = MagicMock(return_value=False)
        from app.services.worker import _process_job
        await _process_job(db, job)


# ── Notification skip ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_demo_job_skips_notification():
    """Anonymous demo job (user_id=None) — no Notification row is added."""
    cat_results = [{"text": "walked the dog", "category": "REFLECTION"}]
    entry = _make_entry(user_id=None)
    job = _make_job(
        entry_id=entry.id, user_id=None, demo_session_id="sess-abc",
    )
    db = _mock_db(entry)
    debit = AsyncMock()

    await _run_process_job(db, job, cat_results, debit_mock=debit)

    notifications = [o for o in db.added if isinstance(o, Notification)]
    assert notifications == [], "demo jobs must not write Notification rows"


@pytest.mark.asyncio
async def test_authed_job_still_writes_notification():
    """Authed job (user_id set) — Notification still gets written."""
    cat_results = [{"text": "shipped feature", "category": "EARNING"}]
    entry = _make_entry(user_id=42)
    job = _make_job(entry_id=entry.id, user_id=42)  # demo_session_id=None
    db = _mock_db(entry)
    debit = AsyncMock()  # not called on authed path

    await _run_process_job(db, job, cat_results, debit_mock=debit)

    notifications = [o for o in db.added if isinstance(o, Notification)]
    assert len(notifications) == 1
    assert notifications[0].user_id == 42
    debit.assert_not_called()


@pytest.mark.asyncio
async def test_demo_job_with_empty_transcript_skips_notification():
    """Empty-transcript branch is the second site we have to guard."""
    cat_results: list = []  # categorize_text not called when transcript empty
    entry = _make_entry(user_id=None)
    job = _make_job(
        entry_id=entry.id, user_id=None, demo_session_id="sess-empty",
    )
    db = _mock_db(entry)

    # Patch the OpenAI Whisper response to return an empty transcript.
    transcript_mock = MagicMock()
    transcript_mock.text = ""
    openai_mock = MagicMock()
    openai_mock.return_value.audio.transcriptions.create = AsyncMock(
        return_value=transcript_mock
    )

    queue_mock = MagicMock(
        mark_step=AsyncMock(),
        complete_job=AsyncMock(),
        fail_job=AsyncMock(),
    )
    storage_mock = MagicMock(download_bytes=AsyncMock(return_value=b"audio"))

    with patch("app.services.worker.queue_svc", queue_mock), \
         patch("app.services.worker.storage_svc", storage_mock), \
         patch(
             "app.services.worker.categorize_text",
             AsyncMock(return_value=cat_results),
         ), \
         patch(
             "app.services.worker.refine_transcript",
             AsyncMock(return_value=""),
         ), \
         patch("app.services.worker._get_openai", openai_mock), \
         patch("app.services.worker._debit_demo_cost", AsyncMock()), \
         patch("app.services.worker.tempfile.NamedTemporaryFile") as mock_tmp, \
         patch("app.services.worker.os.unlink"), \
         patch("builtins.open", MagicMock()):
        mock_tmp.return_value.__enter__ = MagicMock(
            return_value=MagicMock(name="t.webm")
        )
        mock_tmp.return_value.__exit__ = MagicMock(return_value=False)
        from app.services.worker import _process_job
        await _process_job(db, job)

    notifications = [o for o in db.added if isinstance(o, Notification)]
    assert notifications == []


# ── Cost debit on demo jobs ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_demo_job_debits_cost_post_whisper():
    """Demo job must call _debit_demo_cost with the session id and whisper_ms."""
    cat_results = [{"text": "todo: thing", "category": "TODO"}]
    entry = _make_entry(user_id=None)
    entry.duration_seconds = 30  # 30s of audio
    job = _make_job(
        entry_id=entry.id, user_id=None, demo_session_id="sess-cost",
    )
    db = _mock_db(entry)

    debit = AsyncMock()
    await _run_process_job(db, job, cat_results, debit_mock=debit)

    debit.assert_awaited()
    kwargs = debit.call_args.kwargs
    assert kwargs["demo_session_id"] == "sess-cost"
    assert kwargs["audio_seconds"] == 30
    assert kwargs["whisper_ms"] is not None  # measured value


@pytest.mark.asyncio
async def test_authed_job_does_not_debit_cost():
    """Authed jobs must NOT touch demo_cost_counter."""
    cat_results = [{"text": "shipped feature", "category": "EARNING"}]
    entry = _make_entry(user_id=99)
    job = _make_job(entry_id=entry.id, user_id=99)  # demo_session_id=None
    db = _mock_db(entry)

    debit = AsyncMock()
    await _run_process_job(db, job, cat_results, debit_mock=debit)
    debit.assert_not_called()


@pytest.mark.asyncio
async def test_debit_demo_cost_uses_for_update_lock():
    """
    Smoke-check that `_debit_demo_cost` issues a SELECT ... FOR UPDATE
    against demo_cost_counter — required to bound concurrent overshoot.
    """
    from app.services import worker as worker_mod

    captured_stmts = []

    class FakeBegin:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

    class FakeSession:
        def __init__(self):
            self.executed = []

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        def begin(self):
            return FakeBegin()

        async def execute(self, stmt):
            captured_stmts.append(stmt)
            self.executed.append(stmt)
            # Return a result whose scalar_one() yields a fake row, and
            # whose scalar_one_or_none() yields a log row.
            r = MagicMock()
            row = MagicMock()
            row.cost_usd = 0
            r.scalar_one = MagicMock(return_value=row)
            log = MagicMock()
            r.scalar_one_or_none = MagicMock(return_value=log)
            return r

    fake_session = FakeSession()

    def factory():
        return fake_session

    with patch("app.services.worker.async_session", factory):
        await worker_mod._debit_demo_cost(
            demo_session_id="sess-x",
            audio_seconds=10,
            whisper_ms=500,
        )

    # At least one of the captured statements must be a SELECT ... FOR
    # UPDATE on DemoCostCounter. We compile each to string and assert
    # "FOR UPDATE" appears at least once.
    rendered = []
    for s in captured_stmts:
        try:
            rendered.append(str(s.compile(compile_kwargs={"literal_binds": True})))
        except Exception:
            rendered.append(str(s))
    assert any("FOR UPDATE" in r.upper() for r in rendered), (
        f"expected SELECT ... FOR UPDATE on demo_cost_counter; got: {rendered}"
    )
