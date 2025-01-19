from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import Optional, List
from ..database import get_db
from ..models import User, ContentCategory
from ..services.auth import get_current_user
from ..services.categorization import get_entries_by_category
from ..schemas import EntriesResponse, ChatHistoryResponse

router = APIRouter(
    prefix="/api/entries",
    tags=["entries"]
)

@router.get("/", response_model=EntriesResponse)
async def get_entries(
    category: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> EntriesResponse:
    """
    Get categorized entries with optional filtering by category and date range
    """
    try:
        # Convert category string to enum if provided
        content_category = None
        if category:
            try:
                content_category = ContentCategory(category)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid category: {category}"
                )
        
        # Get entries
        entries = await get_entries_by_category(
            db=db,
            user_id=current_user.id,
            category=content_category,
            start_date=start_date,
            end_date=end_date,
            skip=skip,
            limit=limit
        )
        
        # Count total entries
        total_entries = len(entries)
        
        return EntriesResponse(
            entries=[ChatHistoryResponse.from_orm(entry) for entry in entries],
            total=total_entries
        )
        
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
