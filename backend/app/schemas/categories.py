"""
Category-related schemas
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, constr, field_validator
from app.models.categories import ContentCategory


class CustomCategoryBase(BaseModel):
    """Base schema for custom categories."""
    name: constr(min_length=1, max_length=50) = Field(..., description="Name of the custom category")
    color: constr(pattern=r'^#[0-9a-fA-F]{6}$') = Field(..., description="Hex color code (e.g., #FF0000)")
    icon: constr(min_length=1, max_length=50) = Field(..., description="Material-UI icon name")


class CustomCategoryCreate(CustomCategoryBase):
    """Schema for creating a custom category."""
    pass


class CustomCategoryUpdate(BaseModel):
    """Schema for updating a custom category."""
    name: Optional[constr(min_length=1, max_length=50)] = Field(None, description="Name of the custom category")
    color: Optional[constr(pattern=r'^#[0-9a-fA-F]{6}$')] = Field(None, description="Hex color code (e.g., #FF0000)")
    icon: Optional[constr(min_length=1, max_length=50)] = Field(None, description="Material-UI icon name")


class CustomCategoryResponse(CustomCategoryBase):
    """Schema for custom category responses."""
    id: int
    user_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CategorizedEntryBase(BaseModel):
    """Base schema for categorized entries."""
    text: str = Field(..., min_length=1, description="The text content of the entry")
    category: ContentCategory = Field(..., description="Standard category type")
    audio_id: int
    custom_category_id: Optional[int] = Field(None, description="ID of the custom category, if using one")

    @field_validator('custom_category_id')
    @classmethod
    def validate_custom_category(cls, v: Optional[int], values: dict) -> Optional[int]:
        """Validate custom category usage."""
        category = values.get('category')
        if category == ContentCategory.CUSTOM and v is None:
            raise ValueError("custom_category_id is required when category is CUSTOM")
        if category != ContentCategory.CUSTOM and v is not None:
            raise ValueError("custom_category_id should only be set when category is CUSTOM")
        return v


class CategorizedEntryCreate(CategorizedEntryBase):
    """Schema for creating a categorized entry."""
    pass


class CategorizedEntryUpdate(BaseModel):
    """Schema for updating a categorized entry."""
    text: Optional[str] = Field(None, min_length=1, description="The text content of the entry")
    category: Optional[ContentCategory] = Field(None, description="Standard category type")
    audio_id: Optional[int] = None
    custom_category_id: Optional[int] = Field(None, description="ID of the custom category, if using one")

    @field_validator('custom_category_id')
    @classmethod
    def validate_custom_category(cls, v: Optional[int], values: dict) -> Optional[int]:
        """Validate custom category usage."""
        category = values.get('category')
        if category == ContentCategory.CUSTOM and v is None:
            raise ValueError("custom_category_id is required when category is CUSTOM")
        if category is not None and category != ContentCategory.CUSTOM and v is not None:
            raise ValueError("custom_category_id should only be set when category is CUSTOM")
        return v


class CategorizedEntryResponse(CategorizedEntryBase):
    """Schema for categorized entry responses."""
    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    custom_category: Optional[CustomCategoryResponse] = None

    model_config = ConfigDict(from_attributes=True)


class CategoryListResponse(BaseModel):
    """Schema for combined category list response."""
    standard_categories: List[str] = Field(..., description="List of standard category names")
    custom_categories: List[CustomCategoryResponse] = Field(..., description="List of user's custom categories")

    model_config = ConfigDict(from_attributes=True)
