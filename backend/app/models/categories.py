"""
Category models for audio entries
"""
from sqlalchemy import Column, Integer, Text, ForeignKey, DateTime, Enum as SQLEnum, CheckConstraint, String
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
    CUSTOM = "CUSTOM"  # Added for custom categories

class CustomCategory(Base):
    """Model for user-defined custom categories"""
    __tablename__ = "custom_categories"

    id = Column(Integer, primary_key=True)
    name = Column(String(50), nullable=False)
    color = Column(String(7), nullable=False)  # Hex color code
    icon = Column(String(50), nullable=False)  # Icon name from MUI
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("length(name) > 0", name="non_empty_category_name"),
    )

    # Relationships
    user = relationship("User", back_populates="custom_categories")
    entries = relationship("CategorizedEntry", back_populates="custom_category")

class CategorizedEntry(Base):
    """Model for categorized text entries from audio"""
    __tablename__ = "categorized_entries"

    id = Column(Integer, primary_key=True)
    text = Column(Text, nullable=False)
    category = Column(SQLEnum(ContentCategory), nullable=False)
    custom_category_id = Column(Integer, ForeignKey("custom_categories.id", ondelete="SET NULL"), nullable=True)
    audio_id = Column(Integer, ForeignKey("audio.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("length(text) > 0", name="non_empty_text"),
        CheckConstraint(
            "(category != 'CUSTOM' AND custom_category_id IS NULL) OR "
            "(category = 'CUSTOM' AND custom_category_id IS NOT NULL)",
            name="valid_custom_category"
        ),
    )

    # Relationships
    audio = relationship("Audio", back_populates="categorized_entries")
    user = relationship("User", back_populates="categorized_entries")
    custom_category = relationship("CustomCategory", back_populates="entries")
