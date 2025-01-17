from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from typing import Dict, Any

from ..database import get_db
from ..models import User
from ..auth import (
    verify_password,
    create_access_token,
    get_password_hash,
    get_current_user
)

router = APIRouter(
    prefix="/auth",
    tags=["authentication"]
)

@router.post("/token")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, str]:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    # Find user by email
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access token
    access_token = create_access_token(data={"sub": user.email})
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/register", response_model=Dict[str, Any])
async def register(
    username: str,
    email: str,
    password: str,
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """
    Register a new user
    """
    # Check if user exists
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    result = await db.execute(select(User).where(User.username == username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Create new user
    user = User(
        username=username,
        email=email,
        hashed_password=get_password_hash(password),
        created_at=datetime.now(timezone.utc)
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Create access token
    access_token = create_access_token(data={"sub": user.email})
    
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "access_token": access_token,
        "token_type": "bearer"
    }

@router.get("/me", response_model=Dict[str, Any])
async def read_users_me(
    current_user: User = Depends(get_current_user)
):
    return current_user
