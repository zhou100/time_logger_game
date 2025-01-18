from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
from ..database import get_db
from ..models import User
from ..services.categorization import get_entries_by_category, get_entries_by_date_range
from ..auth import get_current_user
from datetime import date
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from ..models import ChatHistory, CategorizedEntry
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/history/{chat_id}")
async def get_chat_history(
    chat_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get chat history and its categorized entries by ID"""
    try:
        # Query chat history with eager loading of categorized entries
        query = (
            select(ChatHistory)
            .options(selectinload(ChatHistory.categorized_entries))
            .where(
                ChatHistory.id == chat_id,
                ChatHistory.user_id == current_user.id
            )
        )
        result = await db.execute(query)
        chat_history = result.scalar_one_or_none()
        
        if not chat_history:
            raise HTTPException(status_code=404, detail="Chat history not found")
        
        logger.info(f"Found chat history with {len(chat_history.categorized_entries)} categorized entries")
        for entry in chat_history.categorized_entries:
            logger.info(f"Category: {entry.category}, Content: {entry.content}")
        
        # Format response
        return {
            "id": chat_history.id,
            "user_id": chat_history.user_id,
            "text": chat_history.text,
            "created_at": chat_history.created_at,
            "categorized_entries": [
                {
                    "id": entry.id,
                    "category": entry.category,
                    "content": entry.content,
                    "created_at": entry.created_at
                }
                for entry in chat_history.categorized_entries
            ]
        }
    except Exception as e:
        logger.error(f"Error retrieving chat history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/entries/by-category/{category}")
async def get_entries_by_category_endpoint(
    category: str,
    page: int = 1,
    page_size: int = 10,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get entries filtered by category"""
    try:
        return await get_entries_by_category(db, current_user.id, category, page, page_size)
    except Exception as e:
        logger.error(f"Error retrieving entries by category: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/entries/by-date")
async def get_entries_by_date_endpoint(
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = 1,
    page_size: int = 10,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get entries filtered by date range"""
    try:
        return await get_entries_by_date_range(
            db, current_user.id, start_date, end_date, page, page_size
        )
    except Exception as e:
        logger.error(f"Error retrieving entries by date: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
