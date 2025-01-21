from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .base import Base

class Audio(Base):
    __tablename__ = 'audio'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    transcribed_text = Column(Text, nullable=False)
    audio_path = Column(String, nullable=True)  # Path to the audio file
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="audio_entries")
    categorized_entries = relationship("CategorizedEntry", back_populates="audio", cascade="all, delete-orphan")
