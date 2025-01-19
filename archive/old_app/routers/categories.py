from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import date
from ..database import get_db
from ..auth import get_current_user
from ..models import User
from ..services.categorization import get_entries_by_category, get_entries_by_date_range

router = APIRouter(
    prefix="/api/categories",
    tags=["categories"]
)

@router.get("/entries")
async def get_entries(
    category: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    page: int = Query(1, gt=0),
    page_size: int = Query(10, gt=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get entries with optional category and date range filters
    """
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    try:
        if category:
            entries = await get_entries_by_category(
                db=db,
                user_id=current_user.id,
                category=category,
                page=page,
                page_size=page_size
            )
        else:
            entries = await get_entries_by_date_range(
                db=db,
                user_id=current_user.id,
                start_date=start_date,
                end_date=end_date,
                page=page,
                page_size=page_size
            )
            
        return {
            "items": entries["items"],
            "total": entries["total"],
            "page": page,
            "page_size": page_size
        }
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
