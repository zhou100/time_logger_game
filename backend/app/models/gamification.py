"""
Gamification models.

UserEvent: append-only event log — source of truth for all gamification state.
UserStats: materialized/cached stats derived from UserEvent.

Stats are recalculated from events so they can be replayed and audited.
"""
import uuid
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, func, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from .base import Base


class UserEvent(Base):
    __tablename__ = "user_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # 'entry_created' | 'streak_extended' | 'badge_earned' | 'level_up'
    event_type = Column(String(50), nullable=False)
    payload = Column(JSONB, nullable=True)
    occurred_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="events")

    __table_args__ = (
        Index("ix_user_events_user_id_type", "user_id", "event_type"),
        Index("ix_user_events_user_id_occurred_at", "user_id", "occurred_at"),
    )


class UserStats(Base):
    __tablename__ = "user_stats"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    total_entries = Column(Integer, default=0, nullable=False)
    current_streak = Column(Integer, default=0, nullable=False)
    longest_streak = Column(Integer, default=0, nullable=False)
    total_minutes_logged = Column(Integer, default=0, nullable=False)
    level = Column(Integer, default=1, nullable=False)
    xp = Column(Integer, default=0, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User", back_populates="stats", uselist=False)
