"""
/api/v1/me — User stats and event history.

Stats are derived from the append-only UserEvent log and cached in UserStats.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from ...models.user import User
from ...models.gamification import UserStats, UserEvent
from ...utils.auth import get_current_user
from ...db import get_db

router = APIRouter(prefix="/me", tags=["me"])

XP_PER_LEVEL = 100


class StatsResponse(BaseModel):
    total_entries: int
    current_streak: int
    longest_streak: int
    total_minutes_logged: int
    level: int
    xp: int
    xp_to_next_level: int


class EventResponse(BaseModel):
    id: str
    event_type: str
    payload: Optional[dict]
    occurred_at: str


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserStats).where(UserStats.user_id == current_user.id)
    )
    stats = result.scalar_one_or_none()

    if not stats:
        return StatsResponse(
            total_entries=0,
            current_streak=0,
            longest_streak=0,
            total_minutes_logged=0,
            level=1,
            xp=0,
            xp_to_next_level=XP_PER_LEVEL,
        )

    return StatsResponse(
        total_entries=stats.total_entries,
        current_streak=stats.current_streak,
        longest_streak=stats.longest_streak,
        total_minutes_logged=stats.total_minutes_logged,
        level=stats.level,
        xp=stats.xp,
        xp_to_next_level=XP_PER_LEVEL - (stats.xp % XP_PER_LEVEL),
    )


@router.get("/events", response_model=List[EventResponse])
async def get_events(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserEvent)
        .where(UserEvent.user_id == current_user.id)
        .order_by(UserEvent.occurred_at.desc())
        .limit(limit)
    )
    events = result.scalars().all()
    return [
        EventResponse(
            id=str(e.id),
            event_type=e.event_type,
            payload=e.payload,
            occurred_at=e.occurred_at.isoformat(),
        )
        for e in events
    ]
