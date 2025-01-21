from sqlalchemy import Column, Integer, String, Boolean, select
from sqlalchemy.orm import relationship
from .base import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    
    # Relationships
    audio_entries = relationship("Audio", back_populates="user", cascade="all, delete-orphan")
    categorized_entries = relationship("CategorizedEntry", back_populates="user", cascade="all, delete-orphan")

    @classmethod
    async def get_by_email(cls, db, email: str):
        """Get user by email."""
        result = await db.execute(
            select(cls).filter(cls.email == email)
        )
        return result.scalar_one_or_none()
