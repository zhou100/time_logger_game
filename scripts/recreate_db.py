import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.database import Base
from app.config import settings
import app.models  # Import all models to ensure they're registered

async def recreate_database():
    # Create engine
    engine = create_async_engine(
        settings.DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://'),
        echo=True,
    )
    
    # Drop all tables using CASCADE
    async with engine.begin() as conn:
        # Drop tables with CASCADE
        await conn.execute(text("DROP TABLE IF EXISTS categorized_entries CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS chat_histories CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS tasks CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS users CASCADE;"))
    
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(recreate_database())
