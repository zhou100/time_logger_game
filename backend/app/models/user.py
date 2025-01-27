from sqlalchemy import Column, Integer, String, Boolean, select
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
import jwt
import os
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
    custom_categories = relationship("CustomCategory", back_populates="user", cascade="all, delete-orphan")

    @classmethod
    async def get_by_email(cls, db, email: str):
        """Get user by email."""
        result = await db.execute(
            select(cls).filter(cls.email == email)
        )
        return result.scalar_one_or_none()

    @classmethod
    async def get_by_id(cls, db, user_id: int):
        """Get user by ID."""
        result = await db.execute(
            select(cls).filter(cls.id == user_id)
        )
        return result.scalar_one_or_none()

    def create_access_token(self, expires_delta: timedelta = None):
        """Create a new access token for the user."""
        if expires_delta is None:
            expires_delta = timedelta(minutes=15)  # Default to 15 minutes
            
        expire = datetime.utcnow() + expires_delta
        to_encode = {
            "exp": expire,
            "sub": str(self.id),
            "email": self.email
        }
        encoded_jwt = jwt.encode(
            to_encode,
            os.getenv("SECRET_KEY", "your-secret-key"),
            algorithm="HS256"
        )
        return encoded_jwt
