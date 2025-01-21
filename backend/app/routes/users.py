"""
User routes
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.user import User
from ..dependencies import get_current_user
from ..db import get_db
from ..schemas.user import UserResponse

router = APIRouter(prefix="/users")

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user info."""
    return current_user
