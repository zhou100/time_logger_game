"""
Unit tests for the personalization-driven validators in entries.py:
- _block_dominant_lock_violations (per-block CJK/Latin script ratios, works for paragraphs or bullets)
- _avoid_topic_advice_violations     (soft check on avoid_topic + advice patterns)
- prefs_stale stamping in _get_cached_audit
- _personalization_enabled kill switch
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.routes.v1.entries import (
    _avoid_topic_advice_violations,
    _get_cached_audit,
    _block_dominant_lock_violations,
    _personalization_enabled,
)


# ── _block_dominant_lock_violations ───────────────────────────────────────


def test_lock_auto_returns_no_violations():
    paragraphs = ["100% English text only.", "Mixed 中文 and English."]
    assert _block_dominant_lock_violations(paragraphs, "auto") == []


def test_lock_en_passes_clean_english():
    paragraphs = [
        "This week showed fragmented focus.",
        "What worked: deep work blocks on Tuesday.",
        "What did not work: too many meetings.",
        "Next week: protect mornings.",
    ]
    assert _block_dominant_lock_violations(paragraphs, "en") == []


def test_lock_en_flags_cjk_heavy_paragraph():
    # >40% CJK chars in para 2
    paragraphs = [
        "Clean English paragraph one.",
        "Hello 你好世界这是中文太多了 abc",  # mostly CJK
    ]
    issues = _block_dominant_lock_violations(paragraphs, "en")
    assert any("paragraph 2" in i for i in issues)


def test_lock_zh_passes_clean_chinese():
    paragraphs = [
        "本周专注力分散，会议过多。",
        "下周保护早晨时间。",
    ]
    assert _block_dominant_lock_violations(paragraphs, "zh") == []


def test_lock_zh_tolerates_some_loanwords():
    # Mix of Chinese + a few English brand names — should NOT violate
    # (latin / scriptic must stay ≤ 60%)
    paragraphs = ["这周用了 GitHub 和 Slack 进行协作工作非常有效率。"]
    assert _block_dominant_lock_violations(paragraphs, "zh") == []


def test_lock_zh_flags_latin_heavy():
    # Latin-dominant paragraph under zh lock
    paragraphs = ["GitHub Slack Notion ClickUp Asana Linear Jira 工作"]
    issues = _block_dominant_lock_violations(paragraphs, "zh")
    assert any("paragraph 1" in i for i in issues)


def test_lock_skips_paragraphs_with_no_script_chars():
    # Pure punctuation/digits — no script chars to count
    paragraphs = ["1234567890 !!!", "Real English content here."]
    assert _block_dominant_lock_violations(paragraphs, "en") == []


def test_lock_en_with_bullet_block_name_uses_bullet_in_error():
    """When called from the bullet-validator path, error messages say 'bullet N'."""
    bullets = [
        "Pattern: clean English.",
        "你好世界这是中文太多了",  # CJK-heavy
    ]
    issues = _block_dominant_lock_violations(bullets, "en", block_name="bullet")
    assert any("bullet 2" in i for i in issues)
    assert not any("paragraph" in i for i in issues)


def test_lock_zh_with_bullet_block_name_uses_bullet_in_error():
    bullets = [
        "模式：注意力分散。",
        "GitHub Slack Notion Linear Asana ClickUp 工作",  # Latin-heavy
    ]
    issues = _block_dominant_lock_violations(bullets, "zh", block_name="bullet")
    assert any("bullet 2" in i for i in issues)


# ── _avoid_topic_advice_violations ────────────────────────────────────────────


def test_avoid_topic_no_topics_no_violations():
    assert _avoid_topic_advice_violations("you should sleep more", []) == []


def test_avoid_topic_single_advice_does_not_trigger():
    # threshold is 2+ violations
    text = "You should sleep more this week."
    assert _avoid_topic_advice_violations(text, ["sleep"]) == []


def test_avoid_topic_two_advice_mentions_flagged():
    text = (
        "You should sleep eight hours each night. "
        "Also try to sleep better by avoiding screens."
    )
    issues = _avoid_topic_advice_violations(text, ["sleep"])
    assert len(issues) == 1
    assert "2" in issues[0]


def test_avoid_topic_advice_outside_window_not_counted():
    # 'sleep' first, advice phrase 200+ chars later → out of ±50 window
    text = (
        "Your sleep was inconsistent this week. "
        + ("filler text " * 30)
        + "You should drink more water."
    )
    assert _avoid_topic_advice_violations(text, ["sleep"]) == []


def test_avoid_topic_word_boundary_prevents_partial_match():
    # 'sleeping' should not match 'sleep' as a word boundary
    text = "You should consider sleeping pills. Try to consider sleeping early."
    # 'sleep' word-boundary regex won't match 'sleeping'
    assert _avoid_topic_advice_violations(text, ["sleep"]) == []


def test_avoid_topic_case_insensitive():
    text = "You should SLEEP more. Make sure SLEEP is a priority."
    issues = _avoid_topic_advice_violations(text, ["sleep"])
    assert len(issues) == 1


# ── _personalization_enabled kill switch ──────────────────────────────────────


def test_personalization_default_on(monkeypatch):
    monkeypatch.delenv("COACHING_PERSONALIZATION_ENABLED", raising=False)
    assert _personalization_enabled() is True


def test_personalization_disabled_via_env(monkeypatch):
    monkeypatch.setenv("COACHING_PERSONALIZATION_ENABLED", "false")
    assert _personalization_enabled() is False


def test_personalization_case_insensitive(monkeypatch):
    monkeypatch.setenv("COACHING_PERSONALIZATION_ENABLED", "FALSE")
    assert _personalization_enabled() is False
    monkeypatch.setenv("COACHING_PERSONALIZATION_ENABLED", "True")
    assert _personalization_enabled() is True


# ── _get_cached_audit prefs_stale ─────────────────────────────────────────────


def _mock_cached_row(generated_at, audit_type="weekly"):
    row = MagicMock()
    row.audit_text = "letter body"
    row.entries_count = 10
    row.breakdown_json = "{}"
    row.report_json = None
    row.generated_at = generated_at
    row.audit_date = generated_at.date()
    return row


def _db_returning(cached):
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = cached
    db.execute = AsyncMock(return_value=result)
    return db


def _user_with_prefs_updated_at(updated_at):
    u = MagicMock()
    u.id = 1
    u.coaching_preferences_updated_at = updated_at
    return u


@pytest.mark.asyncio
async def test_prefs_stale_true_when_prefs_newer_than_audit(monkeypatch):
    monkeypatch.setenv("COACHING_PERSONALIZATION_ENABLED", "true")
    audit_ts = datetime(2026, 4, 13, 10, 0, tzinfo=timezone.utc)
    prefs_ts = audit_ts + timedelta(hours=2)
    db = _db_returning(_mock_cached_row(audit_ts))
    user = _user_with_prefs_updated_at(prefs_ts)

    resp = await _get_cached_audit(db, user_id=1, audit_date=audit_ts.date(),
                                   audit_type="weekly", user=user)
    assert resp is not None
    assert resp.prefs_stale is True


@pytest.mark.asyncio
async def test_prefs_stale_false_when_prefs_older(monkeypatch):
    monkeypatch.setenv("COACHING_PERSONALIZATION_ENABLED", "true")
    audit_ts = datetime(2026, 4, 13, 10, 0, tzinfo=timezone.utc)
    prefs_ts = audit_ts - timedelta(days=1)
    db = _db_returning(_mock_cached_row(audit_ts))
    user = _user_with_prefs_updated_at(prefs_ts)

    resp = await _get_cached_audit(db, user_id=1, audit_date=audit_ts.date(),
                                   audit_type="weekly", user=user)
    assert resp is not None
    assert resp.prefs_stale is False


@pytest.mark.asyncio
async def test_prefs_stale_false_when_user_has_never_set_prefs(monkeypatch):
    monkeypatch.setenv("COACHING_PERSONALIZATION_ENABLED", "true")
    audit_ts = datetime(2026, 4, 13, 10, 0, tzinfo=timezone.utc)
    db = _db_returning(_mock_cached_row(audit_ts))
    user = _user_with_prefs_updated_at(None)

    resp = await _get_cached_audit(db, user_id=1, audit_date=audit_ts.date(),
                                   audit_type="weekly", user=user)
    assert resp is not None
    assert resp.prefs_stale is False


@pytest.mark.asyncio
async def test_prefs_stale_false_when_kill_switch_off(monkeypatch):
    monkeypatch.setenv("COACHING_PERSONALIZATION_ENABLED", "false")
    audit_ts = datetime(2026, 4, 13, 10, 0, tzinfo=timezone.utc)
    prefs_ts = audit_ts + timedelta(hours=2)  # would be stale if enabled
    db = _db_returning(_mock_cached_row(audit_ts))
    user = _user_with_prefs_updated_at(prefs_ts)

    resp = await _get_cached_audit(db, user_id=1, audit_date=audit_ts.date(),
                                   audit_type="weekly", user=user)
    assert resp is not None
    assert resp.prefs_stale is False


@pytest.mark.asyncio
async def test_prefs_stale_false_when_no_user_passed(monkeypatch):
    monkeypatch.setenv("COACHING_PERSONALIZATION_ENABLED", "true")
    audit_ts = datetime(2026, 4, 13, 10, 0, tzinfo=timezone.utc)
    db = _db_returning(_mock_cached_row(audit_ts))

    resp = await _get_cached_audit(db, user_id=1, audit_date=audit_ts.date(),
                                   audit_type="weekly", user=None)
    assert resp is not None
    assert resp.prefs_stale is False


@pytest.mark.asyncio
async def test_prefs_stale_only_for_weekly_not_daily(monkeypatch):
    monkeypatch.setenv("COACHING_PERSONALIZATION_ENABLED", "true")
    audit_ts = datetime(2026, 4, 13, 10, 0, tzinfo=timezone.utc)
    prefs_ts = audit_ts + timedelta(hours=2)
    db = _db_returning(_mock_cached_row(audit_ts, audit_type="daily"))
    user = _user_with_prefs_updated_at(prefs_ts)

    # Even though prefs are newer, daily audits never get prefs_stale=True
    resp = await _get_cached_audit(db, user_id=1, audit_date=audit_ts.date(),
                                   audit_type="daily", user=user)
    assert resp is not None
    assert resp.prefs_stale is False
