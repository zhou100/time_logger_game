from pydantic_settings import BaseSettings
from typing import Optional, List
import os
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    # Database settings
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://time_game:3VIspJYH2vfWkFLHb2BnJw@localhost:5432/timelogger")
    
    # JWT settings
    SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "c137d099a7e94d9684969b2df94ab2d7a7c2f890d4814e5c9e8711ad8d335c42")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # OpenAI settings
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
    
    # Task settings
    MAX_SESSION_DURATION_HOURS: int = 4
    TASK_CATEGORIES: List[str] = [
        "study",
        "workout",
        "family_time",
        "work",
        "hobby",
        "other"
    ]

    # Legacy settings (for backward compatibility)
    API_USERNAME: Optional[str] = os.getenv("API_USERNAME")
    API_PASSWORD: Optional[str] = os.getenv("API_PASSWORD")
    FLASK_ENV: Optional[str] = os.getenv("FLASK_ENV")
    FLASK_APP: Optional[str] = os.getenv("FLASK_APP")

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
