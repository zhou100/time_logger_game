from pydantic_settings import BaseSettings
from typing import Optional, List
import os
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    # Database settings
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://time_game:3VIspJYH2vfWkFLHb2BnJw@localhost:5432/timelogger")
    
    # JWT settings
    SECRET_KEY: str = os.getenv("SECRET_KEY", "c58ea36676a3425d37fd14682f615d94669dceeeda579781488749f1a2bc57b0")
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
