import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def check_db_state():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    
    # Check for any tables in the database
    print("Checking all tables in database...")
    tables = await conn.fetch("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public';
    """)
    
    if tables:
        print("Found tables:")
        for table in tables:
            print(f"- {table['table_name']}")
    else:
        print("No tables found")
    
    # Check for enum types and their dependencies
    print("\nChecking enum types and dependencies...")
    dependencies = await conn.fetch("""
        SELECT 
            t.typname AS enum_name,
            c.relname AS table_name,
            a.attname AS column_name
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        LEFT JOIN pg_class c ON c.relkind = 'r'
        LEFT JOIN pg_attribute a ON a.atttypid = t.oid AND a.attrelid = c.oid
        WHERE t.typname IN ('task_category', 'content_category');
    """)
    
    if dependencies:
        print("Found enum dependencies:")
        for dep in dependencies:
            print(f"Enum {dep['enum_name']} used in {dep['table_name']}.{dep['column_name']}")
    else:
        print("No enum dependencies found")
    
    # Try to forcefully drop the types
    print("\nAttempting to forcefully drop types...")
    try:
        # Drop any tables that might be using the enums
        await conn.execute("""
            DO $$ 
            DECLARE 
                r RECORD;
            BEGIN
                FOR r IN (
                    SELECT tablename 
                    FROM pg_tables 
                    WHERE schemaname = 'public'
                ) LOOP
                    EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
                END LOOP;
            END $$;
        """)
        
        # Now try to drop the enum types
        await conn.execute('DROP TYPE IF EXISTS task_category CASCADE;')
        await conn.execute('DROP TYPE IF EXISTS content_category CASCADE;')
        print("Successfully dropped all tables and enum types")
    except Exception as e:
        print(f"Error dropping types: {e}")
    
    # Verify final state
    print("\nFinal database state:")
    tables = await conn.fetch("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public';
    """)
    
    if tables:
        print("Remaining tables:")
        for table in tables:
            print(f"- {table['table_name']}")
    else:
        print("No tables remaining")
    
    enums = await conn.fetch("""
        SELECT typname 
        FROM pg_type 
        WHERE typname IN ('task_category', 'content_category');
    """)
    
    if enums:
        print("\nRemaining enum types:")
        for enum in enums:
            print(f"- {enum['typname']}")
    else:
        print("\nNo enum types remaining")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check_db_state())
