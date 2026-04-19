"""
Recent-change signal derivation from `weekly_themes`.

Used by the weekly audit prompt to highlight what's emerging, fading, or newly
hurting — relative to the report's week_start (NOT today, so historical
regenerates produce stable output).

Categories:
- emerging:     first_seen in (week_start - 7d, week_start]   → new pattern
- fading:       status='active' AND last_seen ≤ week_start - 14d
                                AND last_seen > week_start - 4*7d
                                                              → going quiet
- new_friction: polarity='negative' AND first_seen in (week_start - 7d, week_start]
                                                              → fresh pain

Precedence: a theme that qualifies for both `new_friction` and `emerging`
appears only in `new_friction` (the more specific/actionable signal wins).
`fading` is disjoint by date geometry.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.weekly_theme import WeeklyTheme


def _theme_payload(t: WeeklyTheme) -> Dict[str, Any]:
    return {
        "id": str(t.id),
        "title": t.title,
        "description": t.description,
        "polarity": t.polarity,
        "category": t.category,
        "first_seen": t.first_seen.isoformat(),
        "last_seen": t.last_seen.isoformat(),
        "occurrences": t.occurrences,
    }


async def derive_recent_change_signals(
    db: AsyncSession,
    user_id: int,
    report_week_start: date,
    lookback_weeks: int = 4,
) -> Dict[str, List[Dict[str, Any]]]:
    """Return {emerging, fading, new_friction} lists for the given week."""
    week_minus_7 = report_week_start - timedelta(days=7)
    week_minus_14 = report_week_start - timedelta(days=14)
    week_minus_lookback = report_week_start - timedelta(days=7 * lookback_weeks)

    # Single broad fetch, then partition in Python — table is small per user.
    result = await db.execute(
        select(WeeklyTheme).where(
            WeeklyTheme.user_id == user_id,
            WeeklyTheme.last_seen >= week_minus_lookback,
        )
    )
    themes = result.scalars().all()

    new_friction: List[Dict[str, Any]] = []
    emerging: List[Dict[str, Any]] = []
    fading: List[Dict[str, Any]] = []

    for t in themes:
        is_recent_first_seen = (
            t.first_seen is not None
            and t.first_seen > week_minus_7
            and t.first_seen <= report_week_start
        )

        if is_recent_first_seen and (t.polarity or "neutral") == "negative":
            new_friction.append(_theme_payload(t))
            continue  # precedence: new_friction wins over emerging

        if is_recent_first_seen:
            emerging.append(_theme_payload(t))

        # `fading` — independent classification, may co-occur with above only
        # if first_seen window AND last_seen window both match (geometrically
        # impossible since last_seen >= first_seen, fading needs last_seen
        # ≤ week_start - 14d while emerging needs first_seen > week_start - 7d)
        if (
            t.status == "active"
            and t.last_seen is not None
            and t.last_seen <= week_minus_14
            and t.last_seen > week_minus_lookback
        ):
            fading.append(_theme_payload(t))

    # Stable ordering for prompt determinism
    new_friction.sort(key=lambda x: (x["first_seen"], x["title"]))
    emerging.sort(key=lambda x: (x["first_seen"], x["title"]))
    fading.sort(key=lambda x: (x["last_seen"], x["title"]))

    return {
        "emerging": emerging,
        "fading": fading,
        "new_friction": new_friction,
    }
