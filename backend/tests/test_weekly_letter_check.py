"""
Unit tests for _check_weekly_letter (Stage 2 validator).

Covers deterministic checks (bullet count, language_lock per-bullet dominant script,
uncomfortable_truth/next_week_action containment) and best-effort behavior when the
LLM groundedness call fails.
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.routes.v1.entries import _check_weekly_letter


ANALYSIS = {
    "uncomfortable_truth": "You spent more time scrolling Twitter than writing code.",
    "next_week_action": "Block social media until lunch on three weekdays.",
    "patterns": ["fragmented focus", "late starts"],
    "naval_balance": "Heavy on LEARNING, light on FAMILY.",
}


def _bullet_letter(bullets: list[str], marker: str = "- ") -> str:
    return "\n".join(f"{marker}{b}" for b in bullets)


def _mock_grounded(result: dict):
    """Mock the OpenAI groundedness check returning the given JSON."""
    import json as _json
    choice = MagicMock()
    choice.message.content = _json.dumps(result)
    resp = MagicMock()
    resp.choices = [choice]
    return resp


@pytest.mark.asyncio
async def test_valid_bullet_letter_passes():
    letter = _bullet_letter([
        "Pattern: fragmented focus and late starts, heavy on LEARNING and light on FAMILY.",
        "Working: you finished the three hardest commits on Tuesday and Thursday.",
        "Not working: You spent more time scrolling Twitter than writing code.",
        "Next: Block social media until lunch on three weekdays.",
    ])
    with patch("app.routes.v1.entries._get_openai") as mock_openai:
        mock_openai.return_value.chat.completions.create = AsyncMock(
            return_value=_mock_grounded({"grounded": True, "reason": "ok"})
        )
        issues = await _check_weekly_letter(letter, ANALYSIS)
    assert issues == []


@pytest.mark.asyncio
async def test_bullet_letter_with_asterisks_passes():
    """Validator should accept `*` bullets as well as `-`."""
    letter = _bullet_letter([
        "Pattern: fragmented focus and late starts.",
        "Working: you finished the hard commits.",
        "Not working: You spent more time scrolling Twitter than writing code.",
        "Next: Block social media until lunch on three weekdays.",
    ], marker="* ")
    with patch("app.routes.v1.entries._get_openai") as mock_openai:
        mock_openai.return_value.chat.completions.create = AsyncMock(
            return_value=_mock_grounded({"grounded": True})
        )
        issues = await _check_weekly_letter(letter, ANALYSIS)
    assert issues == []


@pytest.mark.asyncio
async def test_bullet_letter_with_indent_passes():
    """Validator should tolerate leading whitespace on bullet lines."""
    letter = (
        "   - Pattern: fragmented focus and late starts.\n"
        "  - Working: you finished the hard commits.\n"
        "- Not working: You spent more time scrolling Twitter than writing code.\n"
        "  - Next: Block social media until lunch on three weekdays.\n"
    )
    with patch("app.routes.v1.entries._get_openai") as mock_openai:
        mock_openai.return_value.chat.completions.create = AsyncMock(
            return_value=_mock_grounded({"grounded": True})
        )
        issues = await _check_weekly_letter(letter, ANALYSIS)
    assert issues == []


@pytest.mark.asyncio
async def test_three_bullets_fails():
    letter = _bullet_letter([
        "Pattern about fragmented focus.",
        "Not working: You spent more time scrolling Twitter than writing code.",
        "Next: Block social media until lunch on three weekdays.",
    ])
    with patch("app.routes.v1.entries._get_openai") as mock_openai:
        mock_openai.return_value.chat.completions.create = AsyncMock(
            return_value=_mock_grounded({"grounded": True})
        )
        issues = await _check_weekly_letter(letter, ANALYSIS)
    assert any("4 bullets" in i for i in issues)


@pytest.mark.asyncio
async def test_five_bullets_fails():
    letter = _bullet_letter([
        "Pattern.",
        "Working.",
        "Not working: You spent more time scrolling Twitter than writing code.",
        "Extra bullet the prompt didn't ask for.",
        "Next: Block social media until lunch on three weekdays.",
    ])
    with patch("app.routes.v1.entries._get_openai") as mock_openai:
        mock_openai.return_value.chat.completions.create = AsyncMock(
            return_value=_mock_grounded({"grounded": True})
        )
        issues = await _check_weekly_letter(letter, ANALYSIS)
    assert any("4 bullets" in i for i in issues)


@pytest.mark.asyncio
async def test_no_bullets_fails():
    """Plain prose without bullet markers is rejected."""
    letter = (
        "Pattern paragraph.\n\nWorking paragraph.\n\n"
        "Not working: You spent more time scrolling Twitter than writing code.\n\n"
        "Next: Block social media until lunch on three weekdays."
    )
    with patch("app.routes.v1.entries._get_openai") as mock_openai:
        mock_openai.return_value.chat.completions.create = AsyncMock(
            return_value=_mock_grounded({"grounded": True})
        )
        issues = await _check_weekly_letter(letter, ANALYSIS)
    assert any("4 bullets" in i for i in issues)


@pytest.mark.asyncio
async def test_bullet_missing_uncomfortable_truth_flagged():
    letter = _bullet_letter([
        "Pattern: generic observation with no specifics.",
        "Working: some vague compliment.",
        "Not working: vague softness, no hard truth.",
        "Next: Block social media until lunch on three weekdays.",
    ])
    with patch("app.routes.v1.entries._get_openai") as mock_openai:
        mock_openai.return_value.chat.completions.create = AsyncMock(
            return_value=_mock_grounded({"grounded": True})
        )
        issues = await _check_weekly_letter(letter, ANALYSIS)
    assert any("uncomfortable_truth" in i for i in issues)


@pytest.mark.asyncio
async def test_bullet_missing_next_week_action_flagged():
    letter = _bullet_letter([
        "Pattern: fragmented focus and late starts.",
        "Working: you finished the hardest commits.",
        "Not working: You spent more time scrolling Twitter than writing code.",
        "Next: be better, somehow.",
    ])
    with patch("app.routes.v1.entries._get_openai") as mock_openai:
        mock_openai.return_value.chat.completions.create = AsyncMock(
            return_value=_mock_grounded({"grounded": True})
        )
        issues = await _check_weekly_letter(letter, ANALYSIS)
    assert any("next_week_action" in i for i in issues)


@pytest.mark.asyncio
async def test_bullet_language_lock_en_flags_cjk_heavy_bullet():
    """language_lock=en must flag a bullet dominated by Chinese characters."""
    letter = _bullet_letter([
        "Pattern: fragmented focus and late starts.",
        "这个星期你花了太多时间刷推特而不是写代码完全不专心。",
        "Not working: You spent more time scrolling Twitter than writing code.",
        "Next: Block social media until lunch on three weekdays.",
    ])
    analysis = {**ANALYSIS, "applied_prefs": {"language_lock": "en"}}
    with patch("app.routes.v1.entries._get_openai") as mock_openai:
        mock_openai.return_value.chat.completions.create = AsyncMock(
            return_value=_mock_grounded({"grounded": True})
        )
        issues = await _check_weekly_letter(letter, analysis)
    assert any("language_lock=en" in i and "bullet" in i for i in issues)


@pytest.mark.asyncio
async def test_bullet_language_lock_zh_flags_latin_heavy_bullet():
    """language_lock=zh must flag a bullet dominated by Latin characters."""
    letter = _bullet_letter([
        "模式：本周注意力分散，起步偏晚。",
        "Working: you finished the hardest commits on Tuesday and Thursday despite distractions.",
        "不工作的：你花在刷推特的时间比写代码多。",
        "下一步：工作日午餐前屏蔽社交媒体三天。",
    ])
    analysis_zh = {
        "uncomfortable_truth": "你花在刷推特的时间比写代码多。",
        "next_week_action": "工作日午餐前屏蔽社交媒体三天。",
        "applied_prefs": {"language_lock": "zh"},
    }
    with patch("app.routes.v1.entries._get_openai") as mock_openai:
        mock_openai.return_value.chat.completions.create = AsyncMock(
            return_value=_mock_grounded({"grounded": True})
        )
        issues = await _check_weekly_letter(letter, analysis_zh)
    assert any("language_lock=zh" in i and "bullet" in i for i in issues)


@pytest.mark.asyncio
async def test_groundedness_check_failure_is_best_effort():
    """If the LLM groundedness call times out, deterministic checks still run and
    the function does not raise."""
    letter = _bullet_letter([
        "Pattern: fragmented focus and late starts.",
        "Working: finished the hard commits.",
        "Not working: You spent more time scrolling Twitter than writing code.",
        "Next: Block social media until lunch on three weekdays.",
    ])
    with patch("app.routes.v1.entries._get_openai") as mock_openai:
        mock_openai.return_value.chat.completions.create = AsyncMock(
            side_effect=asyncio.TimeoutError()
        )
        issues = await _check_weekly_letter(letter, ANALYSIS)
    assert issues == []


@pytest.mark.asyncio
async def test_empty_letter_flagged():
    issues = await _check_weekly_letter("", ANALYSIS)
    assert issues == ["Letter is empty."]


@pytest.mark.asyncio
async def test_llm_reports_ungrounded():
    """If the LLM says the letter contains info not in the analysis, that's flagged."""
    letter = _bullet_letter([
        "Pattern: fragmented focus and late starts.",
        "Working: you fired two employees this week.",
        "Not working: You spent more time scrolling Twitter than writing code.",
        "Next: Block social media until lunch on three weekdays.",
    ])
    with patch("app.routes.v1.entries._get_openai") as mock_openai:
        mock_openai.return_value.chat.completions.create = AsyncMock(
            return_value=_mock_grounded({
                "grounded": False,
                "reason": "claims employee firings not present in analysis",
            })
        )
        issues = await _check_weekly_letter(letter, ANALYSIS)
    assert any("not in the analysis" in i for i in issues)
