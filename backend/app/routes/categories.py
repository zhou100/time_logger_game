"""
Category-related routes
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.categories import CategorizedEntry, ContentCategory
from app.models.audio import Audio
from app.models.user import User
from app.db import get_db
from app.dependencies import get_current_user
from app.schemas.categories import CategorizedEntryCreate, CategorizedEntryResponse

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/api/v1/categories/entries", response_model=CategorizedEntryResponse, status_code=201)
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
            user_id=current_user.id
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

@router.get("/api/v1/categories/entries", response_model=List[CategorizedEntryResponse])
async def list_category_entries(
    category: Optional[ContentCategory] = None,
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
        query = query.limit(size).offset(offset)
        
        result = await db.execute(query)
        entries = result.scalars().all()
        
        logger.info(f"Found {len(entries)} entries")
        return [CategorizedEntryResponse.from_orm(entry) for entry in entries]
        
    except Exception as e:
        logger.error(f"Error listing category entries: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/v1/categories/entries/{entry_id}", response_model=CategorizedEntryResponse)
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

@router.get("/api/v1/categories/entries/audio/{audio_id}", response_model=List[CategorizedEntryResponse])
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

@router.delete("/api/v1/categories/entries/{entry_id}", status_code=204)
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
