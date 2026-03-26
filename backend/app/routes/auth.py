from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.user import User
from ..utils.auth import (
    get_user,
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    get_current_user,
)
from ..db import get_db
from datetime import timedelta
from pydantic import BaseModel, EmailStr, ConfigDict
from jose import jwt, JWTError
from ..settings import settings
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth")

# OAuth2 scheme for token handling
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

# Pydantic models
class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserInDB(UserBase):
    id: int
    is_active: bool

    model_config = ConfigDict(from_attributes=True)

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

    model_config = ConfigDict(from_attributes=True)

class RefreshRequest(BaseModel):
    refresh_token: str

@router.post("/register", response_model=Token)
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user exists
    db_user = await get_user(db, user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    hashed_password = get_password_hash(user.password)
    db_user = User(email=user.email, hashed_password=hashed_password)
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)

    # Create access token
    access_token = create_access_token(data={"sub": user.email})
    refresh_token = create_refresh_token(data={"sub": user.email})
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer"
    )

@router.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    """Login endpoint that returns access and refresh tokens."""
    logger.debug(f"Login attempt for user: {form_data.username}")
    logger.debug(f"Form data: {form_data.__dict__}")
    
    try:
        # Get the user
        user = await get_user(db, form_data.username)
        if not user:
            logger.warning(f"Login failed - user not found: {form_data.username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Verify password
        if not verify_password(form_data.password, user.hashed_password):
            logger.warning(f"Failed login attempt for user: {form_data.username}")
            logger.debug(f"Password verification failed for user: {form_data.username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        logger.debug(f"Creating tokens for user: {user.email}")
        access_token = create_access_token(data={"sub": user.email})
        refresh_token = create_refresh_token(data={"sub": user.email})
        
        response = {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer"
        }
        logger.debug(f"Login successful for user: {user.email}")
        logger.debug(f"Response: {response}")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during login: {str(e)}")
        logger.exception("Login error details:")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.post("/refresh", response_model=Token)
async def refresh_token(request: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Refresh access token using refresh token."""
    try:
        logger.info(f"Refresh token request received")
        
        # Verify refresh token
        try:
            payload = jwt.decode(request.refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            logger.info(f"Token decoded successfully: {payload}")
        except JWTError as e:
            logger.error(f"JWT decode error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid refresh token: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        email: str = payload.get("sub")
        if email is None:
            logger.error("No email in token payload")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token: no email",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Get user from database
        user = await get_user(db, email)
        if user is None:
            logger.error(f"User not found: {email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        logger.info(f"Creating new tokens for user: {email}")
        # Create new tokens
        access_token = create_access_token(data={"sub": email})
        refresh_token = create_refresh_token(data={"sub": email})
        
        logger.info("Token refresh successful")
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in refresh_token: {str(e)}")
        logger.exception("Refresh token error details:")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

# Test endpoint
@router.post("/test-token")
async def test_token():
    """Test endpoint that returns a hardcoded token response."""
    return {
        "access_token": "test_token",
        "refresh_token": "test_refresh",
        "token_type": "bearer"
    }

# Pydantic models
