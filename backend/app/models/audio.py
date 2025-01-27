"""
Audio model for storing transcribed audio data.
"""
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from .base import Base

class Audio(Base):
    __tablename__ = "audio"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    transcribed_text = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    audio_path = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)

    # Relationships
    user = relationship("User", back_populates="audio_entries")
    categorized_entries = relationship("CategorizedEntry", back_populates="audio", cascade="all, delete-orphan")

    def to_dict(self):
        """Convert model to dictionary with proper datetime handling."""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "transcribed_text": self.transcribed_text,
            "filename": self.filename,
            "content_type": self.content_type,
            "file_path": self.file_path,
            "audio_path": self.audio_path,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
