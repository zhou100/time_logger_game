"""
Unit tests for app.services.weekly_signals.derive_recent_change_signals.

We use a real test DB (via the existing db_session fixture) for one happy-path
end-to-end test, then mock the DB for the precedence + window edge cases. This
keeps the date geometry checks deterministic without seeding many rows.
"""
from __future__ import annotations

import uuid
from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.weekly_theme import WeeklyTheme
from app.services.weekly_signals import derive_recent_change_signals


def _theme(**overrides):
    """Build a WeeklyTheme-shaped object (real or mock)."""
    t = WeeklyTheme(
        id=overrides.pop("id", uuid.uuid4()),
        user_id=overrides.pop("user_id", 1),
        title=overrides.pop("title", "focus drift"),
        description=overrides.pop("description", "scattered attention"),
        polarity=overrides.pop("polarity", "neutral"),
        category=overrides.pop("category", "LEARNING"),
        first_seen=overrides.pop("first_seen", date(2026, 4, 1)),
        last_seen=overrides.pop("last_seen", date(2026, 4, 6)),
        occurrences=overrides.pop("occurrences", 1),
        status=overrides.pop("status", "active"),
    )
    for k, v in overrides.items():
        setattr(t, k, v)
    return t


def _mock_db_returning(themes):
    db = AsyncMock()
    result = MagicMock()
    scalars = MagicMock()
    scalars.all.return_value = themes
    result.scalars.return_value = scalars
    db.execute = AsyncMock(return_value=result)
    return db


# Anchor week: Monday 2026-04-13 (so week_minus_7 = 2026-04-06, week_minus_14 = 2026-03-30)
WEEK_START = date(2026, 4, 13)


@pytest.mark.asyncio
async def test_emerging_theme_first_seen_in_window():
    # first_seen = 2026-04-10 → falls in (2026-04-06, 2026-04-13]
    t = _theme(first_seen=date(2026, 4, 10), last_seen=date(2026, 4, 12), polarity="neutral")
    db = _mock_db_returning([t])
    out = await derive_recent_change_signals(db, user_id=1, report_week_start=WEEK_START)
    assert len(out["emerging"]) == 1
    assert out["emerging"][0]["title"] == "focus drift"
    assert out["new_friction"] == []
    assert out["fading"] == []


@pytest.mark.asyncio
async def test_new_friction_takes_precedence_over_emerging():
    # Negative + first_seen recent → must appear ONLY in new_friction
    t = _theme(
        title="sleep slipping",
        first_seen=date(2026, 4, 9),
        last_seen=date(2026, 4, 12),
        polarity="negative",
    )
    db = _mock_db_returning([t])
    out = await derive_recent_change_signals(db, user_id=1, report_week_start=WEEK_START)
    assert len(out["new_friction"]) == 1
    assert out["new_friction"][0]["title"] == "sleep slipping"
    # critical: NOT also in emerging
    assert out["emerging"] == []


@pytest.mark.asyncio
async def test_fading_active_with_old_last_seen():
    # Active, last_seen 2026-03-25 (≤ week_minus_14 = 2026-03-30) and within 4w lookback
    t = _theme(
        title="old habit",
        first_seen=date(2026, 3, 1),
        last_seen=date(2026, 3, 25),
        status="active",
    )
    db = _mock_db_returning([t])
    out = await derive_recent_change_signals(db, user_id=1, report_week_start=WEEK_START)
    assert len(out["fading"]) == 1
    assert out["fading"][0]["title"] == "old habit"


@pytest.mark.asyncio
async def test_fading_excludes_dismissed_status():
    # Same date geometry but status=dismissed → not fading
    t = _theme(
        title="dismissed habit",
        first_seen=date(2026, 3, 1),
        last_seen=date(2026, 3, 25),
        status="dismissed",
    )
    db = _mock_db_returning([t])
    out = await derive_recent_change_signals(db, user_id=1, report_week_start=WEEK_START)
    assert out["fading"] == []


@pytest.mark.asyncio
async def test_first_seen_exactly_on_boundary_excluded():
    # first_seen == week_minus_7 = 2026-04-06 → exclusive lower bound, not emerging
    t = _theme(first_seen=date(2026, 4, 6), last_seen=date(2026, 4, 8))
    db = _mock_db_returning([t])
    out = await derive_recent_change_signals(db, user_id=1, report_week_start=WEEK_START)
    assert out["emerging"] == []
    assert out["new_friction"] == []


@pytest.mark.asyncio
async def test_first_seen_after_report_week_start_excluded():
    # Future first_seen (relative to report) — can happen if regenerating an
    # older report after new themes were created. Must be excluded.
    t = _theme(first_seen=date(2026, 4, 20), last_seen=date(2026, 4, 22))
    db = _mock_db_returning([t])
    out = await derive_recent_change_signals(db, user_id=1, report_week_start=WEEK_START)
    assert out["emerging"] == []
    assert out["new_friction"] == []


@pytest.mark.asyncio
async def test_empty_themes_returns_empty_lists():
    db = _mock_db_returning([])
    out = await derive_recent_change_signals(db, user_id=1, report_week_start=WEEK_START)
    assert out == {"emerging": [], "fading": [], "new_friction": []}


@pytest.mark.asyncio
async def test_stable_sort_for_determinism():
    # Two emerging themes with same first_seen → sort by title for stable output
    t1 = _theme(title="zeta", first_seen=date(2026, 4, 10), last_seen=date(2026, 4, 11))
    t2 = _theme(title="alpha", first_seen=date(2026, 4, 10), last_seen=date(2026, 4, 11))
    db = _mock_db_returning([t1, t2])
    out = await derive_recent_change_signals(db, user_id=1, report_week_start=WEEK_START)
    titles = [t["title"] for t in out["emerging"]]
    assert titles == ["alpha", "zeta"]
