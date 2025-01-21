"""
Category models for audio entries
"""
from sqlalchemy import Column, Integer, Text, ForeignKey, DateTime, Enum as SQLEnum, CheckConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from enum import Enum

from app.models.base import Base

class ContentCategory(str, Enum):
    """Categories for audio content"""
    TODO = "TODO"
    IDEA = "IDEA"
    QUESTION = "QUESTION"
    REMINDER = "REMINDER"

class CategorizedEntry(Base):
    """Model for categorized text entries from audio"""
    __tablename__ = "categorized_entries"

    id = Column(Integer, primary_key=True)
    text = Column(Text, nullable=False)
    category = Column(SQLEnum(ContentCategory), nullable=False)
    audio_id = Column(Integer, ForeignKey("audio.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("length(text) > 0", name="non_empty_text"),
    )

    # Relationships
    audio = relationship("Audio", back_populates="categorized_entries")
    user = relationship("User", back_populates="categorized_entries")
