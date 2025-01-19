"""
Chat history models.
"""
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from ..database import Base

class ChatHistory(Base):
    """Chat history model."""
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)
    transcribed_text = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
