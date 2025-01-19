from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import StaticPool
from .config import settings

# Handle both PostgreSQL and SQLite URLs
if settings.DATABASE_URL.startswith('sqlite'):
    engine = create_async_engine(
        settings.DATABASE_URL.replace('sqlite:///', 'sqlite+aiosqlite:///'),
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=True,
    )
else:
    engine = create_async_engine(
        settings.DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://'),
        echo=True,
    )

async_session = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()

async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
