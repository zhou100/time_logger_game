"""
Users router
"""
from typing import Annotated
from fastapi import APIRouter, Depends
from app.models.user import User
from app.dependencies import get_current_user
from app.schemas.user import UserResponse

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Get current user info."""
    return current_user
