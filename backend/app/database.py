"""
Database configuration
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from .models.base import Base
import os
import logging
from typing import AsyncGenerator, Callable

# Configure logging
logger = logging.getLogger(__name__)

# Get database URL from environment variable, default to SQLite
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./app.db")

logger.info(f"Using database URL: {DATABASE_URL}")

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)

# Create async session factory
async_session = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get a database session"""
    logger.debug("Creating new database session")
    async with async_session() as session:
        try:
            yield session
            await session.commit()
            logger.debug("Database session committed")
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session rolled back due to error: {str(e)}")
            raise
        finally:
            await session.close()
            logger.debug("Database session closed")

def override_get_db(db: AsyncSession) -> Callable[[], AsyncGenerator[AsyncSession, None]]:
    """Create a database dependency override for testing"""
    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        logger.debug("Using overridden database session")
        try:
            yield db
        finally:
            logger.debug("Finished using overridden database session")
    return _override_get_db
