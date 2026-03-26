from sqlalchemy import Column, Integer, String, Boolean, select
from sqlalchemy.orm import relationship
from .base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    google_id = Column(String, unique=True, nullable=True, index=True)
    auth_provider = Column(String(20), default="email")  # "email" | "google"

    # Relationships
    entries = relationship("Entry", back_populates="user", cascade="all, delete-orphan")
    custom_categories = relationship("CustomCategory", back_populates="user", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    events = relationship("UserEvent", back_populates="user", cascade="all, delete-orphan")
    stats = relationship("UserStats", back_populates="user", uselist=False, cascade="all, delete-orphan")

    # Legacy relationships kept for backward-compatibility during migration
    audio_entries = relationship("Audio", back_populates="user", cascade="all, delete-orphan")
    categorized_entries = relationship("CategorizedEntry", back_populates="user", cascade="all, delete-orphan")

    @classmethod
    async def get_by_email(cls, db, email: str):
        result = await db.execute(select(cls).filter(cls.email == email))
        return result.scalar_one_or_none()

    @classmethod
    async def get_by_id(cls, db, user_id: int):
        result = await db.execute(select(cls).filter(cls.id == user_id))
        return result.scalar_one_or_none()

    @classmethod
    async def get_by_google_id(cls, db, google_id: str):
        result = await db.execute(select(cls).filter(cls.google_id == google_id))
        return result.scalar_one_or_none()
