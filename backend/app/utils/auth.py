from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy import select
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.user import User
from ..db import get_db
from ..settings import settings
import logging

logger = logging.getLogger(__name__)

# Security configuration
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT refresh token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

async def get_user(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).filter(User.email == email))
    return result.scalar_one_or_none()

async def authenticate_user(db: AsyncSession, email: str, password: str) -> Optional[User]:
    """Authenticate a user by email and password."""
    user = await get_user(db, email)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user

# Add OAuth2 scheme for token handling
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    """Validate JWT token and return current user."""
    logger.debug(f"Validating token: {token[:10]}...")
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        logger.error("No token provided")
        raise credentials_exception

    try:
        # Remove Bearer prefix if present
        if token.startswith("Bearer "):
            token = token[7:]  # Remove 'Bearer ' prefix
            
        # Verify token format
        token_parts = token.split(".")
        if len(token_parts) != 3:
            logger.error(f"Invalid token format. Expected 3 parts, got {len(token_parts)}")
            raise credentials_exception
            
        # Decode and validate token
        logger.debug("Attempting to decode token...")
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        logger.debug(f"Token payload: {payload}")
        
        email: str = payload.get("sub")
        if email is None:
            logger.error("Token payload missing 'sub' claim")
            raise credentials_exception
            
        # Check token expiration
        exp = payload.get("exp")
        if exp is None:
            logger.error("Token payload missing 'exp' claim")
            raise credentials_exception
            
        now = datetime.now(timezone.utc).timestamp()
        if now > exp:
            logger.error(f"Token expired. Expiration: {datetime.fromtimestamp(exp).isoformat()}, Current: {datetime.fromtimestamp(now).isoformat()}")
            raise credentials_exception
            
    except JWTError as e:
        logger.error(f"JWT validation failed: {str(e)}")
        raise credentials_exception
        
    # Verify user exists
    logger.debug(f"Looking up user with email: {email}")
    user = await get_user(db, email)
    if user is None:
        logger.error(f"No user found with email: {email}")
        raise credentials_exception
        
    logger.debug(f"Successfully validated token for user: {email}")
    return user
