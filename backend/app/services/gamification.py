"""
Event-sourced gamification engine.

All state changes flow through append_event() — stats are derived from the
event log so they can be audited, replayed, and recalculated.
"""
import logging
from datetime import date, timedelta, datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from ..models.gamification import UserEvent, UserStats

logger = logging.getLogger(__name__)

XP_PER_ENTRY = 10
XP_PER_MINUTE = 2
XP_PER_LEVEL = 100


async def append_event(
    db: AsyncSession, user_id: int, event_type: str, payload: dict
) -> UserEvent:
    """Append an immutable event to the user's event log."""
    event = UserEvent(user_id=user_id, event_type=event_type, payload=payload)
    db.add(event)
    await db.flush()
    return event


async def get_or_create_stats(db: AsyncSession, user_id: int) -> UserStats:
    result = await db.execute(select(UserStats).where(UserStats.user_id == user_id))
    stats = result.scalar_one_or_none()
    if not stats:
        stats = UserStats(user_id=user_id)
        db.add(stats)
        await db.flush()
    return stats


async def calculate_streak(db: AsyncSession, user_id: int) -> int:
    """
    Derive current streak from the event log.
    A streak is consecutive calendar days (UTC) ending today or yesterday
    on which the user created at least one entry.
    """
    result = await db.execute(
        select(func.date(UserEvent.occurred_at).label("day"))
        .where(UserEvent.user_id == user_id, UserEvent.event_type == "entry_created")
        .group_by(func.date(UserEvent.occurred_at))
        .order_by(func.date(UserEvent.occurred_at).desc())
    )
    activity_days = [row.day for row in result.fetchall()]

    if not activity_days:
        return 0

    today = date.today()
    # Streak is broken if most recent activity is older than yesterday
    if activity_days[0] < today - timedelta(days=1):
        return 0

    streak = 0
    expected = activity_days[0]  # start from most recent active day
    for day in activity_days:
        if day == expected:
            streak += 1
            expected -= timedelta(days=1)
        else:
            break

    return streak


async def process_entry_created(
    db: AsyncSession,
    user_id: int,
    entry_id: str,
    duration_seconds: Optional[int] = None,
) -> UserStats:
    """
    Handle all gamification side-effects when an entry is successfully processed.
    Returns the updated UserStats.
    """
    duration_minutes = (duration_seconds or 0) // 60
    xp_gained = XP_PER_ENTRY + (duration_minutes * XP_PER_MINUTE)

    # 1. Append entry event
    await append_event(db, user_id, "entry_created", {
        "entry_id": entry_id,
        "duration_seconds": duration_seconds,
        "xp_gained": xp_gained,
    })

    # 2. Re-derive streak from events
    streak = await calculate_streak(db, user_id)

    # 3. Update materialized stats
    stats = await get_or_create_stats(db, user_id)
    prev_streak = stats.current_streak

    stats.total_entries += 1
    stats.total_minutes_logged += duration_minutes
    stats.xp += xp_gained
    stats.current_streak = streak
    stats.longest_streak = max(stats.longest_streak, streak)

    prev_level = stats.level
    stats.level = 1 + (stats.xp // XP_PER_LEVEL)

    await db.flush()

    # 4. Emit secondary events
    if streak > prev_streak and streak > 1:
        await append_event(db, user_id, "streak_extended", {"streak": streak})

    if stats.level > prev_level:
        await append_event(db, user_id, "level_up", {
            "old_level": prev_level,
            "new_level": stats.level,
        })

    return stats
