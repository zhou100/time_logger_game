"""
Category-related schemas
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
from app.models.categories import ContentCategory

class CategorizedEntryBase(BaseModel):
    """Base schema for categorized entries."""
    text: str = Field(..., min_length=1, description="The text content of the entry")
    category: ContentCategory
    audio_id: int

class CategorizedEntryCreate(CategorizedEntryBase):
    """Schema for creating a categorized entry."""
    pass

class CategorizedEntryResponse(CategorizedEntryBase):
    """Schema for categorized entry responses."""
    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)  # This replaces the class Config
