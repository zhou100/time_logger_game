import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def check_db():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    
    # Check tables
    tables = await conn.fetch("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name;
    """)
    
    print("Tables:")
    for table in tables:
        print(f"\n{table['table_name']}:")
        columns = await conn.fetch("""
            SELECT column_name, data_type, udt_name
            FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position;
        """, table['table_name'])
        
        for col in columns:
            print(f"  - {col['column_name']}: {col['udt_name']}")
    
    # Check enum types
    enums = await conn.fetch("""
        SELECT t.typname AS enum_name, e.enumlabel AS enum_value
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        ORDER BY t.typname, e.enumsortorder;
    """)
    
    print("\nEnum Types:")
    current_enum = None
    for enum in enums:
        if enum['enum_name'] != current_enum:
            current_enum = enum['enum_name']
            print(f"\n{current_enum}:")
        print(f"  - {enum['enum_value']}")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check_db())
