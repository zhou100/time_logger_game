"""
Category models for audio entries
"""
from enum import Enum
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Enum as SQLEnum
from sqlalchemy.sql import func
from .base import Base

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
    audio_id = Column(Integer, ForeignKey("audio.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
