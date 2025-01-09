from sqlalchemy import create_engine, text
import sys

# Database URL
DATABASE_URL = "postgresql://time_game:3VIspJYH2vfWkFLHb2BnJw@localhost:5432/timelogger"

try:
    # Create engine
    engine = create_engine(DATABASE_URL)
    
    # Try to connect
    with engine.connect() as connection:
        result = connection.execute(text("SELECT version();"))
        version = result.scalar()
        print("Successfully connected to the database!")
        print(f"PostgreSQL version: {version}")
    
except Exception as e:
    print(f"Error connecting to the database: {str(e)}")
    sys.exit(1)
