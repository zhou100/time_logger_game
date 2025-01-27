"""
Category-related routes
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, select, delete, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.categories import CategorizedEntry, ContentCategory, CustomCategory
from app.models.audio import Audio
from app.models.user import User
from app.db import get_db
from app.dependencies import get_current_user
from app.schemas.categories import (
    CategorizedEntryCreate,
    CategorizedEntryResponse,
    CustomCategoryCreate,
    CustomCategoryUpdate,
    CustomCategoryResponse,
    CategoryListResponse,
)

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

# Custom Category Endpoints

@router.post("/categories/custom", response_model=CustomCategoryResponse, status_code=201)
async def create_custom_category(
    category: CustomCategoryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new custom category."""
    logger.info(f"Creating custom category: name='{category.name}' color={category.color} icon={category.icon}")
    
    try:
        # Check if category name already exists for this user
        stmt = select(CustomCategory).where(
            and_(
                CustomCategory.name == category.name,
                CustomCategory.user_id == current_user.id
            )
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        
        if existing:
            logger.error(f"Category name '{category.name}' already exists for user {current_user.id}")
            raise HTTPException(
                status_code=400,
                detail=f"Category name '{category.name}' already exists"
            )

        # Create new category
        db_category = CustomCategory(
            name=category.name,
            color=category.color,
            icon=category.icon,
            user_id=current_user.id
        )
        db.add(db_category)
        await db.commit()
        await db.refresh(db_category)
        
        logger.info(f"Successfully created custom category with ID: {db_category.id}")
        return CustomCategoryResponse.from_orm(db_category)
        
    except HTTPException as e:
        logger.error(f"HTTP error creating custom category: {str(e)}")
        await db.rollback()
        raise
    except Exception as e:
        logger.error(f"Error creating custom category: {str(e)}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/categories", response_model=CategoryListResponse)
async def list_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all categories (both standard and custom)."""
    logger.info(f"Listing categories for user {current_user.id}")
    
    try:
        # Get custom categories
        stmt = select(CustomCategory).where(CustomCategory.user_id == current_user.id)
        result = await db.execute(stmt)
        custom_categories = result.scalars().all()
        
        # Get standard categories
        standard_categories = [cat.value for cat in ContentCategory]
        
        logger.info(f"Found {len(custom_categories)} custom categories and {len(standard_categories)} standard categories")
        return CategoryListResponse(
            standard_categories=standard_categories,
            custom_categories=[CustomCategoryResponse.from_orm(cat) for cat in custom_categories]
        )
        
    except Exception as e:
        logger.error(f"Error listing categories: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/categories/custom/{category_id}", response_model=CustomCategoryResponse)
async def get_custom_category(
    category_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific custom category."""
    logger.info(f"Getting custom category {category_id} for user {current_user.id}")
    
    try:
        stmt = select(CustomCategory).where(
            and_(
                CustomCategory.id == category_id,
                CustomCategory.user_id == current_user.id
            )
        )
        result = await db.execute(stmt)
        category = result.scalar_one_or_none()
        
        if not category:
            logger.error(f"Custom category {category_id} not found or does not belong to user {current_user.id}")
            raise HTTPException(
                status_code=404,
                detail=f"Custom category not found"
            )
            
        return CustomCategoryResponse.from_orm(category)
        
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"Error getting custom category: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/categories/custom/{category_id}", response_model=CustomCategoryResponse)
async def update_custom_category(
    category_id: int,
    category: CustomCategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a custom category."""
    logger.info(f"Updating custom category {category_id}")
    
    try:
        # Check if category exists and belongs to user
        stmt = select(CustomCategory).where(
            and_(
                CustomCategory.id == category_id,
                CustomCategory.user_id == current_user.id
            )
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        
        if not existing:
            logger.error(f"Custom category {category_id} not found or does not belong to user {current_user.id}")
            raise HTTPException(
                status_code=404,
                detail="Custom category not found"
            )
            
        # Check if new name conflicts with existing category
        if category.name and category.name != existing.name:
            name_check = select(CustomCategory).where(
                and_(
                    CustomCategory.name == category.name,
                    CustomCategory.user_id == current_user.id,
                    CustomCategory.id != category_id
                )
            )
            result = await db.execute(name_check)
            if result.scalar_one_or_none():
                raise HTTPException(
                    status_code=400,
                    detail=f"Category name '{category.name}' already exists"
                )
        
        # Update fields
        update_data = category.model_dump(exclude_unset=True)
        if update_data:
            stmt = (
                update(CustomCategory)
                .where(
                    and_(
                        CustomCategory.id == category_id,
                        CustomCategory.user_id == current_user.id
                    )
                )
                .values(**update_data)
            )
            await db.execute(stmt)
            await db.commit()
            
        # Refresh and return updated category
        stmt = select(CustomCategory).where(CustomCategory.id == category_id)
        result = await db.execute(stmt)
        updated = result.scalar_one()
        return CustomCategoryResponse.from_orm(updated)
        
    except HTTPException as e:
        await db.rollback()
        raise
    except Exception as e:
        logger.error(f"Error updating custom category: {str(e)}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/categories/custom/{category_id}", status_code=204)
async def delete_custom_category(
    category_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a custom category."""
    logger.info(f"Deleting custom category {category_id}")
    
    try:
        # Check if category exists and belongs to user
        stmt = select(CustomCategory).where(
            and_(
                CustomCategory.id == category_id,
                CustomCategory.user_id == current_user.id
            )
        )
        result = await db.execute(stmt)
        category = result.scalar_one_or_none()
        
        if not category:
            logger.error(f"Custom category {category_id} not found or does not belong to user {current_user.id}")
            raise HTTPException(
                status_code=404,
                detail="Custom category not found"
            )
            
        # Check if category is in use
        stmt = select(CategorizedEntry).where(
            CategorizedEntry.custom_category_id == category_id
        )
        result = await db.execute(stmt)
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="Cannot delete category that is in use"
            )
            
        # Delete category
        stmt = delete(CustomCategory).where(
            and_(
                CustomCategory.id == category_id,
                CustomCategory.user_id == current_user.id
            )
        )
        await db.execute(stmt)
        await db.commit()
        
        logger.info(f"Successfully deleted custom category {category_id}")
        
    except HTTPException as e:
        await db.rollback()
        raise
    except Exception as e:
        logger.error(f"Error deleting custom category: {str(e)}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/categories/entries", response_model=CategorizedEntryResponse, status_code=201)
async def create_categorized_entry(
    entry: CategorizedEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new categorized entry."""
    logger.info(f"Creating category entry: text='{entry.text}' category={entry.category} audio_id={entry.audio_id}")
    logger.info(f"Current user: {current_user.id}")
    logger.info(f"Session ID: {id(db)}")
    
    try:
        # Verify audio exists and belongs to user
        stmt = select(Audio).where(
            and_(
                Audio.id == entry.audio_id,
                Audio.user_id == current_user.id
            )
        )
        logger.info(f"Looking for audio {entry.audio_id} for user {current_user.id}")
        result = await db.execute(stmt)
        audio = result.scalar_one_or_none()
        
        if not audio:
            logger.error(f"Audio {entry.audio_id} not found or does not belong to user {current_user.id}")
            raise HTTPException(
                status_code=404,
                detail=f"Audio {entry.audio_id} not found or does not belong to user {current_user.id}"
            )

        logger.info(f"Found audio entry: {audio.id} (user_id: {audio.user_id})")
        
        # Create new entry
        db_entry = CategorizedEntry(
            text=entry.text,
            category=entry.category,
            audio_id=entry.audio_id,
            user_id=current_user.id,
            custom_category_id=entry.custom_category_id
        )
        db.add(db_entry)
        await db.flush()  # Flush changes to get the ID
        
        # Commit the transaction
        await db.commit()
        await db.refresh(db_entry)
        
        logger.info(f"Successfully created category entry with ID: {db_entry.id}")
        return CategorizedEntryResponse.from_orm(db_entry)
        
    except HTTPException as e:
        logger.error(f"HTTP error creating category entry: {str(e)}")
        await db.rollback()
        raise e
    except Exception as e:
        logger.error(f"Error creating category entry: {str(e)}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/categories/entries", response_model=List[CategorizedEntryResponse])
async def list_category_entries(
    category: Optional[ContentCategory] = None,
    custom_category_id: Optional[int] = None,
    size: Optional[int] = 50,
    offset: Optional[int] = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List categorized entries."""
    logger.info(f"Listing category entries: category={category} size={size} offset={offset}")
    logger.info(f"Current user: {current_user.id}")
    
    try:
        query = select(CategorizedEntry).where(CategorizedEntry.user_id == current_user.id)
        if category:
            query = query.where(CategorizedEntry.category == category)
        if custom_category_id:
            query = query.where(CategorizedEntry.custom_category_id == custom_category_id)
        query = query.limit(size).offset(offset)
        
        result = await db.execute(query)
        entries = result.scalars().all()
        
        logger.info(f"Found {len(entries)} entries")
        return [CategorizedEntryResponse.from_orm(entry) for entry in entries]
        
    except Exception as e:
        logger.error(f"Error listing category entries: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/categories/entries/{entry_id}", response_model=CategorizedEntryResponse)
async def get_category_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific categorized entry."""
    logger.info(f"Getting category entry: {entry_id}")
    logger.info(f"Current user: {current_user.id}")
    
    try:
        stmt = select(CategorizedEntry).where(
            and_(
                CategorizedEntry.id == entry_id,
                CategorizedEntry.user_id == current_user.id
            )
        )
        result = await db.execute(stmt)
        entry = result.scalar_one_or_none()
        
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        
        return CategorizedEntryResponse.from_orm(entry)
        
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error getting category entry: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/categories/entries/audio/{audio_id}", response_model=List[CategorizedEntryResponse])
async def get_categorized_entries(
    audio_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all categorized entries for an audio."""
    logger.info(f"Getting category entries for audio {audio_id}")
    logger.info(f"Current user: {current_user.id}")
    
    try:
        stmt = select(CategorizedEntry).where(
            and_(
                CategorizedEntry.audio_id == audio_id,
                CategorizedEntry.user_id == current_user.id
            )
        )
        result = await db.execute(stmt)
        entries = result.scalars().all()
        
        logger.info(f"Found {len(entries)} entries for audio {audio_id}")
        return [CategorizedEntryResponse.from_orm(entry) for entry in entries]
        
    except Exception as e:
        logger.error(f"Error getting category entries: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/categories/entries/{entry_id}", status_code=204)
async def delete_category_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a categorized entry"""
    try:
        stmt = select(CategorizedEntry).where(
            and_(
                CategorizedEntry.id == entry_id,
                CategorizedEntry.user_id == current_user.id
            )
        )
        result = await db.execute(stmt)
        entry = result.scalar_one_or_none()
        
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        
        await db.delete(entry)
        await db.commit()
    except Exception as e:
        logger.error(f"Error deleting category entry: {str(e)}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
