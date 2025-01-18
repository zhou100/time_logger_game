from datetime import datetime, timezone
from typing import Dict, Any
import logging

from fastapi import APIRouter, Depends, HTTPException, status, Body
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..config import settings
from ..database import get_db
from ..models import User
from ..schemas import UserCreate, UserResponse
from ..auth import (
    verify_password,
    create_access_token,
    get_password_hash,
    get_current_user,
    authenticate_user
)

router = APIRouter(tags=["authentication"])

logger = logging.getLogger(__name__)

@router.post("/token")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, str]:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    logger.debug(f"Login attempt for username: {form_data.username}")
    
    # Find user by email
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    
    if not user:
        logger.debug(f"User not found: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not verify_password(form_data.password, user.hashed_password):
        logger.debug(f"Invalid password for user: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access token
    logger.debug(f"Creating access token for user: {form_data.username}")
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user: UserCreate = Body(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new user
    """
    logger.debug(f"Registration attempt for email: {user.email}")
    
    # Check if user exists
    result = await db.execute(select(User).where(User.email == user.email))
    if result.scalar_one_or_none():
        logger.debug(f"Email already registered: {user.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    result = await db.execute(select(User).where(User.username == user.username))
    if result.scalar_one_or_none():
        logger.debug(f"Username already taken: {user.username}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Create new user
    logger.debug(f"Creating new user with email: {user.email}")
    hashed_password = get_password_hash(user.password)
    db_user = User(
        email=user.email,
        username=user.username,
        hashed_password=hashed_password
    )
    
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    
    logger.debug(f"Successfully created user with email: {user.email}")
    return db_user

@router.get("/me")
async def read_users_me(current_user: User = Depends(get_current_user)):
    """
    Get current user
    """
    return current_user
