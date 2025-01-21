"""
Test configuration and fixtures
"""
import os
import pytest
import logging
import asyncio
from typing import AsyncGenerator, Dict
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from passlib.context import CryptContext

from app.main import app
from app.models.user import User
from app.models.base import Base
from app.db import get_db
from app.dependencies import get_current_user

# Configure logging
logger = logging.getLogger(__name__)

# Set test mode
os.environ["TEST_MODE"] = "true"

# Configure pytest-asyncio to use session scope
pytest.register_assert_rewrite('pytest_asyncio')
pytestmark = pytest.mark.asyncio(scope="session")

# Test database URL
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/time_logger_test"
)

# Create test engine
test_engine = create_async_engine(
    TEST_DATABASE_URL,
    echo=True,
    future=True,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10
)

# Create test session factory
test_async_session = sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# Password hasher
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@pytest.fixture(autouse=True)
async def setup_database():
    """Set up the test database before each test."""
    async with test_engine.begin() as conn:
        # Drop all tables to ensure clean state
        await conn.run_sync(Base.metadata.drop_all)
        # Create all tables
        await conn.run_sync(Base.metadata.create_all)
        logger.info("Test database initialized")
    yield
    async with test_engine.begin() as conn:
        # Clean up after test
        await conn.run_sync(Base.metadata.drop_all)
        logger.info("Test database cleaned up")

@pytest.fixture
async def test_db() -> AsyncGenerator[AsyncSession, None]:
    """Get a test database session."""
    async with test_async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

@pytest.fixture
async def test_user(test_db: AsyncSession) -> User:
    """Create a test user."""
    user = User(
        email="test@example.com",
        hashed_password=pwd_context.hash("testpass123"),
        is_active=True
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user

@pytest.fixture
def auth_headers(test_user: User) -> Dict[str, str]:
    """Get authorization headers."""
    return {"Authorization": f"Bearer test-token-{test_user.id}"}

@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Create a test client."""
    async with AsyncClient(app=app, base_url="http://testserver") as client:
        yield client

@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client without authentication."""
    async with AsyncClient(app=app, base_url="http://testserver") as client:
        yield client

@pytest.fixture
async def auth_async_client(auth_headers) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client with authentication headers."""
    async with AsyncClient(app=app, base_url="http://testserver", headers=auth_headers) as client:
        yield client
