"""
/api/v1/auth — Authentication with short-lived JWTs and DB-backed refresh token revocation.

Key differences from the legacy auth:
- Access tokens expire in 15 minutes (not 4 hours)
- Refresh tokens are stored in the DB with a jti claim — they can be revoked
- Refresh rotation: each refresh call revokes the old token and issues a new one
- sub claim is user_id (int), not email — cleaner and decoupled from email changes
- No debug/test endpoints
"""
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr, ConfigDict
from jose import jwt, JWTError

from ...models.user import User
from ...models.gamification import UserStats
from ...models.refresh_token import RefreshToken
from ...utils.auth import verify_password, get_password_hash, get_user, get_current_user
from ...db import get_db
from ...settings import settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: int
    email: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: int
    email: str
    model_config = ConfigDict(from_attributes=True)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_access_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def _make_refresh_token(db: AsyncSession, user: User, user_agent: str | None) -> str:
    jti = uuid.uuid4()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    db.add(RefreshToken(
        jti=jti,
        user_id=user.id,
        expires_at=expires_at,
        user_agent=user_agent,
    ))
    await db.flush()

    payload = {
        "sub": str(user.id),
        "jti": str(jti),
        "exp": expires_at,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _token_response(access: str, refresh: str, user: User) -> TokenResponse:
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user_id=user.id,
        email=user.email,
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate, request: Request, db: AsyncSession = Depends(get_db)):
    if await get_user(db, user_in.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(email=user_in.email, hashed_password=get_password_hash(user_in.password))
    db.add(user)
    await db.flush()

    # Initialise stats row
    db.add(UserStats(user_id=user.id))
    await db.flush()

    access = _make_access_token(user)
    refresh = await _make_refresh_token(db, user, request.headers.get("user-agent"))
    await db.commit()

    logger.info(f"Registered user {user.email} (id={user.id})")
    return _token_response(access, refresh, user)


@router.post("/token", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    user = await get_user(db, form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access = _make_access_token(user)
    refresh = await _make_refresh_token(
        db, user, request.headers.get("user-agent") if request else None
    )
    await db.commit()

    logger.info(f"Login: user {user.email}")
    return _token_response(access, refresh, user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Rotate refresh token: revoke the presented token, issue a new pair.
    """
    try:
        payload = jwt.decode(body.refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong token type")

    try:
        jti = uuid.UUID(payload["jti"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed token")

    result = await db.execute(select(RefreshToken).where(RefreshToken.jti == jti))
    token_record = result.scalar_one_or_none()

    if not token_record or token_record.is_revoked or token_record.is_expired:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token invalid or expired")

    # Revoke old token (rotation)
    token_record.revoked_at = datetime.now(timezone.utc)

    user = await User.get_by_id(db, token_record.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    access = _make_access_token(user)
    refresh_new = await _make_refresh_token(db, user, request.headers.get("user-agent"))
    await db.commit()

    return _token_response(access, refresh_new, user)


@router.post("/logout")
async def logout(
    body: RefreshRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a specific refresh token (log out of one session)."""
    try:
        payload = jwt.decode(body.refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        jti = uuid.UUID(payload["jti"])
        result = await db.execute(select(RefreshToken).where(RefreshToken.jti == jti))
        record = result.scalar_one_or_none()
        if record and record.user_id == current_user.id and not record.is_revoked:
            record.revoked_at = datetime.now(timezone.utc)
            await db.commit()
    except Exception:
        pass  # best-effort; always return success
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
