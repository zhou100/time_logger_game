"""
Unit tests for app.services.categorization.categorize_text().

All OpenAI calls are mocked — no network required.
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.categorization import categorize_text


def _mock_openai_response(content: str):
    """Build a minimal mock that matches the openai response shape."""
    choice = MagicMock()
    choice.message.content = content
    response = MagicMock()
    response.choices = [choice]
    return response


# ── Happy path ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_single_entry_earning():
    """Short transcript with one clear activity produces a single EARNING entry."""
    payload = json.dumps([{"text": "Had a 1-on-1 with my manager", "category": "EARNING"}])
    mock_create = AsyncMock(return_value=_mock_openai_response(payload))

    with patch("app.services.categorization._get_client") as mock_client:
        mock_client.return_value.chat.completions.create = mock_create
        result = await categorize_text("Had a 1-on-1 with my manager this morning.")

    assert len(result) == 1
    assert result[0]["category"] == "EARNING"
    assert "manager" in result[0]["text"].lower()


@pytest.mark.asyncio
async def test_multi_entry_extraction():
    """Long transcript produces multiple entries with correct categories."""
    items = [
        {"text": "Worked on dashboard for 2 hours", "category": "EARNING"},
        {"text": "Read a chapter of a design book", "category": "LEARNING"},
        {"text": "Picked up the kids from school", "category": "FAMILY"},
        {"text": "Gym session after work", "category": "RELAXING"},
    ]
    payload = json.dumps(items)
    mock_create = AsyncMock(return_value=_mock_openai_response(payload))

    with patch("app.services.categorization._get_client") as mock_client:
        mock_client.return_value.chat.completions.create = mock_create
        result = await categorize_text(
            "This morning I worked on the dashboard for about 2 hours. "
            "Read a chapter of a design book over lunch. "
            "Picked up the kids from school. Hit the gym after work."
        )

    assert len(result) == 4
    categories = {r["category"] for r in result}
    assert categories == {"EARNING", "LEARNING", "FAMILY", "RELAXING"}


@pytest.mark.asyncio
async def test_all_valid_categories_accepted():
    """All four valid categories are returned as-is."""
    items = [
        {"text": "A", "category": "EARNING"},
        {"text": "B", "category": "LEARNING"},
        {"text": "C", "category": "RELAXING"},
        {"text": "D", "category": "FAMILY"},
    ]
    mock_create = AsyncMock(return_value=_mock_openai_response(json.dumps(items)))

    with patch("app.services.categorization._get_client") as mock_client:
        mock_client.return_value.chat.completions.create = mock_create
        result = await categorize_text("Some transcript text covering many topics.")

    assert len(result) == 4
    assert {r["category"] for r in result} == {"EARNING", "LEARNING", "RELAXING", "FAMILY"}


# ── Fallback: empty / malformed LLM response ─────────────────────────────────

@pytest.mark.asyncio
async def test_empty_array_from_llm_falls_back_to_earning():
    """LLM returns [] → fallback to single EARNING entry with full transcript."""
    mock_create = AsyncMock(return_value=_mock_openai_response("[]"))

    with patch("app.services.categorization._get_client") as mock_client:
        mock_client.return_value.chat.completions.create = mock_create
        result = await categorize_text("This is my transcript.")

    assert len(result) == 1
    assert result[0]["category"] == "EARNING"
    assert result[0]["text"] == "This is my transcript."


@pytest.mark.asyncio
async def test_malformed_json_falls_back_to_earning():
    """LLM returns invalid JSON → fallback to single EARNING entry."""
    mock_create = AsyncMock(return_value=_mock_openai_response("not valid json {{{"))

    with patch("app.services.categorization._get_client") as mock_client:
        mock_client.return_value.chat.completions.create = mock_create
        result = await categorize_text("My transcript here.")

    assert len(result) == 1
    assert result[0]["category"] == "EARNING"
    assert result[0]["text"] == "My transcript here."


@pytest.mark.asyncio
async def test_single_dict_instead_of_list_falls_back():
    """LLM returns a single dict (old format) instead of list → fallback."""
    old_format = json.dumps({"category": "EARNING", "content": "do something", "confidence": 0.9})
    mock_create = AsyncMock(return_value=_mock_openai_response(old_format))

    with patch("app.services.categorization._get_client") as mock_client:
        mock_client.return_value.chat.completions.create = mock_create
        result = await categorize_text("do something")

    assert len(result) == 1
    assert result[0]["category"] == "EARNING"


@pytest.mark.asyncio
async def test_api_exception_falls_back_to_earning():
    """OpenAI API call raises an exception → fallback to EARNING, no crash."""
    mock_create = AsyncMock(side_effect=Exception("Network error"))

    with patch("app.services.categorization._get_client") as mock_client:
        mock_client.return_value.chat.completions.create = mock_create
        result = await categorize_text("Something happened today.")

    assert len(result) == 1
    assert result[0]["category"] == "EARNING"


# ── Empty transcript ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_empty_transcript_raises():
    """Empty or blank transcript raises ValueError('No speech detected')."""
    with pytest.raises(ValueError, match="No speech detected"):
        await categorize_text("")


@pytest.mark.asyncio
async def test_whitespace_only_transcript_raises():
    """Whitespace-only transcript raises ValueError('No speech detected')."""
    with pytest.raises(ValueError, match="No speech detected"):
        await categorize_text("   \n\t  ")
