"""
Categories router module
"""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.categories import ContentCategory, CategorizedEntry, CustomCategory
from app.models.user import User
from app.schemas.categories import (
    CategorizedEntryCreate,
    CategorizedEntryResponse,
    CategorizedEntryUpdate,
    CustomCategoryCreate,
    CustomCategoryResponse,
    CustomCategoryUpdate,
    CategoryListResponse
)

router = APIRouter(prefix="/v1/categories", tags=["categories"])


@router.get("/entries", response_model=List[CategorizedEntryResponse])
async def get_all_entries(
    offset: int = Query(0, ge=0),
    size: int = Query(10, ge=1, le=100),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all categorized entries with pagination."""
    query = select(CategorizedEntry).filter(CategorizedEntry.user_id == current_user.id)

    if start_date:
        query = query.filter(CategorizedEntry.created_at >= start_date)
    if end_date:
        query = query.filter(CategorizedEntry.created_at <= end_date)

    query = query.offset(offset).limit(size)
    result = await db.execute(query)
    entries = result.scalars().all()
    return entries


@router.get("/entries/{category}", response_model=List[CategorizedEntryResponse])
async def get_entries_by_category(
    category: ContentCategory,
    offset: int = Query(0, ge=0),
    size: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get categorized entries by category."""
    query = select(CategorizedEntry).filter(
        CategorizedEntry.user_id == current_user.id,
        CategorizedEntry.category == category
    ).offset(offset).limit(size)
    result = await db.execute(query)
    entries = result.scalars().all()
    return entries


@router.post("/entries", response_model=CategorizedEntryResponse)
async def create_entry(
    entry: CategorizedEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new categorized entry."""
    if entry.category == ContentCategory.CUSTOM and entry.custom_category_id:
        # Verify custom category exists and belongs to user
        custom_category = await db.get(CustomCategory, entry.custom_category_id)
        if not custom_category or custom_category.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Custom category not found")

    db_entry = CategorizedEntry(
        **entry.model_dump(),
        user_id=current_user.id
    )
    db.add(db_entry)
    await db.commit()
    await db.refresh(db_entry)
    return db_entry


@router.put("/entries/{entry_id}", response_model=CategorizedEntryResponse)
async def update_entry(
    entry_id: int,
    entry_update: CategorizedEntryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a categorized entry."""
    db_entry = await db.get(CategorizedEntry, entry_id)
    if not db_entry or db_entry.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Entry not found")

    if entry_update.category == ContentCategory.CUSTOM and entry_update.custom_category_id:
        # Verify custom category exists and belongs to user
        custom_category = await db.get(CustomCategory, entry_update.custom_category_id)
        if not custom_category or custom_category.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Custom category not found")

    update_data = entry_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_entry, field, value)

    await db.commit()
    await db.refresh(db_entry)
    return db_entry


@router.delete("/entries/{entry_id}")
async def delete_entry(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a categorized entry."""
    db_entry = await db.get(CategorizedEntry, entry_id)
    if not db_entry or db_entry.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Entry not found")

    await db.delete(db_entry)
    await db.commit()
    return {"message": "Entry deleted successfully"}


@router.get("/list", response_model=CategoryListResponse)
async def list_categories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all available categories (both standard and custom)."""
    query = select(CustomCategory).filter(CustomCategory.user_id == current_user.id)
    result = await db.execute(query)
    custom_categories = result.scalars().all()

    return CategoryListResponse(
        standard_categories=[cat.value for cat in ContentCategory if cat != ContentCategory.CUSTOM],
        custom_categories=custom_categories
    )


@router.post("/custom", response_model=CustomCategoryResponse)
async def create_custom_category(
    category: CustomCategoryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new custom category."""
    db_category = CustomCategory(
        **category.model_dump(),
        user_id=current_user.id
    )
    db.add(db_category)
    await db.commit()
    await db.refresh(db_category)
    return db_category


@router.put("/custom/{category_id}", response_model=CustomCategoryResponse)
async def update_custom_category(
    category_id: int,
    category_update: CustomCategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a custom category."""
    db_category = await db.get(CustomCategory, category_id)
    if not db_category or db_category.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Custom category not found")

    update_data = category_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_category, field, value)

    await db.commit()
    await db.refresh(db_category)
    return db_category


@router.delete("/custom/{category_id}")
async def delete_custom_category(
    category_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a custom category."""
    db_category = await db.get(CustomCategory, category_id)
    if not db_category or db_category.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Custom category not found")

    await db.delete(db_category)
    await db.commit()
    return {"message": "Custom category deleted successfully"}
