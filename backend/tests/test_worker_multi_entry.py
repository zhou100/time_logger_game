"""
Unit tests for the worker's multi-entry classification loop.

All I/O (OpenAI, storage, WebSocket, DB) is mocked.
Tests focus on the classification insertion loop and stale-job recovery.
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch, call

from app.models.jobs import Job, JobStatus
from app.models.entry import Entry
from app.models.classification import EntryClassification


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_entry(user_id=1, transcript="test transcript"):
    e = MagicMock(spec=Entry)
    e.id = uuid.uuid4()
    e.user_id = user_id
    e.raw_audio_key = f"audio/{user_id}/test.webm"
    e.transcript = transcript
    e.duration_seconds = 60
    return e


def _make_job(entry_id=None):
    j = MagicMock(spec=Job)
    j.id = uuid.uuid4()
    j.entry_id = entry_id or uuid.uuid4()
    j.status = JobStatus.processing
    return j


# ── Classification loop: correct number of rows ───────────────────────────────

@pytest.mark.asyncio
async def test_three_item_result_inserts_three_rows():
    """3-item categorization result → 3 EntryClassification rows added to db."""
    cat_results = [
        {"text": "Worked on dashboard", "category": "TIME_RECORD"},
        {"text": "Add voice replay idea", "category": "IDEA"},
        {"text": "Write auth tests", "category": "TODO"},
    ]

    entry = _make_entry()
    job = _make_job(entry_id=entry.id)

    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=entry)))
    added_objects = []
    db.add = lambda obj: added_objects.append(obj)
    db.flush = AsyncMock()
    db.commit = AsyncMock()

    with patch("app.services.worker.queue_svc") as mock_queue, \
         patch("app.services.worker.storage_svc") as mock_storage, \
         patch("app.services.worker.categorize_text", new=AsyncMock(return_value=cat_results)), \
         patch("app.services.worker.process_entry_created", new=AsyncMock(return_value=MagicMock(current_streak=1, total_entries=1, level=1, xp=10))), \
         patch("app.services.worker._get_openai") as mock_openai:

        # Whisper mock
        transcript_mock = MagicMock()
        transcript_mock.text = "some transcript"
        mock_openai.return_value.audio.transcriptions.create = AsyncMock(return_value=transcript_mock)

        # Storage mock
        mock_storage.download_bytes = AsyncMock(return_value=b"fake audio bytes")

        mock_queue.mark_step = AsyncMock()
        mock_queue.complete_job = AsyncMock()
        mock_queue.fail_job = AsyncMock()

        # Patch tempfile to avoid actual file I/O
        with patch("app.services.worker.tempfile.NamedTemporaryFile") as mock_tmp, \
             patch("app.services.worker.os.unlink"):
            mock_tmp.return_value.__enter__ = MagicMock(return_value=MagicMock(name="test.webm"))
            mock_tmp.return_value.__exit__ = MagicMock(return_value=False)
            with patch("builtins.open", MagicMock()):
                from app.services.worker import _process_job
                await _process_job(db, job)

    classification_rows = [o for o in added_objects if isinstance(o, EntryClassification)]
    assert len(classification_rows) == 3


@pytest.mark.asyncio
async def test_display_order_is_sequential():
    """display_order values are 0, 1, 2 — not all 0."""
    cat_results = [
        {"text": "First", "category": "TODO"},
        {"text": "Second", "category": "IDEA"},
        {"text": "Third", "category": "THOUGHT"},
    ]

    entry = _make_entry()
    job = _make_job(entry_id=entry.id)

    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=entry)))
    added_objects = []
    db.add = lambda obj: added_objects.append(obj)
    db.flush = AsyncMock()
    db.commit = AsyncMock()

    with patch("app.services.worker.queue_svc") as mock_queue, \
         patch("app.services.worker.storage_svc") as mock_storage, \
         patch("app.services.worker.categorize_text", new=AsyncMock(return_value=cat_results)), \
         patch("app.services.worker.process_entry_created", new=AsyncMock(return_value=MagicMock(current_streak=1, total_entries=1, level=1, xp=10))), \
         patch("app.services.worker._get_openai") as mock_openai:

        transcript_mock = MagicMock()
        transcript_mock.text = "some transcript"
        mock_openai.return_value.audio.transcriptions.create = AsyncMock(return_value=transcript_mock)
        mock_storage.download_bytes = AsyncMock(return_value=b"fake audio bytes")
        mock_queue.mark_step = AsyncMock()
        mock_queue.complete_job = AsyncMock()
        mock_queue.fail_job = AsyncMock()

        with patch("app.services.worker.tempfile.NamedTemporaryFile") as mock_tmp, \
             patch("app.services.worker.os.unlink"):
            mock_tmp.return_value.__enter__ = MagicMock(return_value=MagicMock(name="test.webm"))
            mock_tmp.return_value.__exit__ = MagicMock(return_value=False)
            with patch("builtins.open", MagicMock()):
                from app.services.worker import _process_job
                await _process_job(db, job)

    rows = [o for o in added_objects if isinstance(o, EntryClassification)]
    assert [r.display_order for r in rows] == [0, 1, 2]


@pytest.mark.asyncio
async def test_empty_categorization_fallback_inserts_one_thought():
    """
    Fallback from categorize_text already returns [{"text": ..., "category": "THOUGHT"}],
    so the worker inserts exactly 1 row with category THOUGHT.
    """
    fallback = [{"text": "full transcript text", "category": "THOUGHT"}]

    entry = _make_entry(transcript="full transcript text")
    job = _make_job(entry_id=entry.id)

    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=entry)))
    added_objects = []
    db.add = lambda obj: added_objects.append(obj)
    db.flush = AsyncMock()
    db.commit = AsyncMock()

    with patch("app.services.worker.queue_svc") as mock_queue, \
         patch("app.services.worker.storage_svc") as mock_storage, \
         patch("app.services.worker.categorize_text", new=AsyncMock(return_value=fallback)), \
         patch("app.services.worker.process_entry_created", new=AsyncMock(return_value=MagicMock(current_streak=1, total_entries=1, level=1, xp=10))), \
         patch("app.services.worker._get_openai") as mock_openai:

        transcript_mock = MagicMock()
        transcript_mock.text = "full transcript text"
        mock_openai.return_value.audio.transcriptions.create = AsyncMock(return_value=transcript_mock)
        mock_storage.download_bytes = AsyncMock(return_value=b"bytes")
        mock_queue.mark_step = AsyncMock()
        mock_queue.complete_job = AsyncMock()
        mock_queue.fail_job = AsyncMock()

        with patch("app.services.worker.tempfile.NamedTemporaryFile") as mock_tmp, \
             patch("app.services.worker.os.unlink"):
            mock_tmp.return_value.__enter__ = MagicMock(return_value=MagicMock(name="test.webm"))
            mock_tmp.return_value.__exit__ = MagicMock(return_value=False)
            with patch("builtins.open", MagicMock()):
                from app.services.worker import _process_job
                await _process_job(db, job)

    rows = [o for o in added_objects if isinstance(o, EntryClassification)]
    assert len(rows) == 1
    assert rows[0].category == "THOUGHT"


# ── WebSocket broadcast shape ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_websocket_broadcast_contains_categories_array():
    """The WS broadcast sends categories array, not single category string."""
    cat_results = [
        {"text": "Task one", "category": "TODO"},
        {"text": "Task two", "category": "IDEA"},
    ]

    entry = _make_entry()
    job = _make_job(entry_id=entry.id)

    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=entry)))
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()

    ws_calls = []

    async def fake_send(user_id, payload):
        ws_calls.append(payload)

    with patch("app.services.worker.queue_svc") as mock_queue, \
         patch("app.services.worker.storage_svc") as mock_storage, \
         patch("app.services.worker.categorize_text", new=AsyncMock(return_value=cat_results)), \
         patch("app.services.worker.process_entry_created", new=AsyncMock(return_value=MagicMock(current_streak=1, total_entries=1, level=1, xp=10))), \
         patch("app.services.worker._get_openai") as mock_openai, \
         patch("app.services.worker.async_session"), \
         patch("app.routes.v1.ws.manager") as mock_manager:

        mock_manager.send_to_user = fake_send
        transcript_mock = MagicMock()
        transcript_mock.text = "test"
        mock_openai.return_value.audio.transcriptions.create = AsyncMock(return_value=transcript_mock)
        mock_storage.download_bytes = AsyncMock(return_value=b"bytes")
        mock_queue.mark_step = AsyncMock()
        mock_queue.complete_job = AsyncMock()
        mock_queue.fail_job = AsyncMock()

        with patch("app.services.worker.tempfile.NamedTemporaryFile") as mock_tmp, \
             patch("app.services.worker.os.unlink"):
            mock_tmp.return_value.__enter__ = MagicMock(return_value=MagicMock(name="test.webm"))
            mock_tmp.return_value.__exit__ = MagicMock(return_value=False)
            with patch("builtins.open", MagicMock()):
                from app.services.worker import _process_job
                await _process_job(db, job)

    classified_events = [e for e in ws_calls if e.get("type") == "entry.classified"]
    assert len(classified_events) == 1
    evt = classified_events[0]
    assert "categories" in evt
    assert isinstance(evt["categories"], list)
    assert len(evt["categories"]) == 2
    assert "category" not in evt  # old single-category key must be gone


# ── Stale-job recovery ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_stale_job_recovery_fails_old_jobs():
    """_recover_stale_jobs marks PROCESSING jobs older than 5 min as failed."""
    from app.services.worker import _recover_stale_jobs

    stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    stale_job = MagicMock(spec=Job)
    stale_job.id = uuid.uuid4()
    stale_job.status = JobStatus.processing
    stale_job.updated_at = stale_cutoff

    db = AsyncMock()
    db.execute = AsyncMock(
        return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[stale_job]))))
    )
    db.commit = AsyncMock()

    with patch("app.services.worker.queue_svc") as mock_queue:
        mock_queue.fail_job = AsyncMock()
        await _recover_stale_jobs(db)

    mock_queue.fail_job.assert_called_once()
    call_args = mock_queue.fail_job.call_args
    assert call_args[0][1] == stale_job
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_stale_job_recovery_ignores_fresh_jobs():
    """_recover_stale_jobs does NOT fail jobs that are recent."""
    from app.services.worker import _recover_stale_jobs

    db = AsyncMock()
    # Simulate no stale jobs found
    db.execute = AsyncMock(
        return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[]))))
    )
    db.commit = AsyncMock()

    with patch("app.services.worker.queue_svc") as mock_queue:
        mock_queue.fail_job = AsyncMock()
        await _recover_stale_jobs(db)

    mock_queue.fail_job.assert_not_called()
    db.commit.assert_not_called()
