import asyncio
from app.database import engine
from sqlalchemy import text

async def get_schema():
    async with engine.begin() as conn:
        # Get all tables
        result = await conn.execute(text("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name NOT LIKE 'sqlite_%'
        """))
        tables = result.scalars().all()
        
        print('\nTables:')
        for table in tables:
            print(f'\n{table}:')
            
            # Get columns for each table
            result = await conn.execute(text(f"""
                PRAGMA table_info('{table}')
            """))
            columns = result.all()
            for col in columns:
                print(f'  {col.name}: {col.type} (nullable: {not col.notnull}, pk: {col.pk})')

if __name__ == '__main__':
    asyncio.run(get_schema())
