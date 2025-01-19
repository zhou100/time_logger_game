import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def check_enums():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    
    # Check task_category enum values
    task_values = await conn.fetch("""
        SELECT e.enumlabel
        FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'task_category'
        ORDER BY e.enumsortorder;
    """)
    
    print("task_category values:")
    if task_values:
        for val in task_values:
            print(f"- {val['enumlabel']}")
    else:
        print("No values found")
    
    # Check content_category enum values
    content_values = await conn.fetch("""
        SELECT e.enumlabel
        FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'content_category'
        ORDER BY e.enumsortorder;
    """)
    
    print("\ncontent_category values:")
    if content_values:
        for val in content_values:
            print(f"- {val['enumlabel']}")
    else:
        print("No values found")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check_enums())
