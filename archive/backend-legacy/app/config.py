"""
Application settings.
"""
import os
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import ConfigDict

class Settings(BaseSettings):
    """Application settings."""
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/time_logger_game"
    )
    TEST_DATABASE_URL: str = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/time_logger_test"
    )
    
    # JWT
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # GPT Model
    GPT_MODEL: str = "gpt-4o-mini"
    
    # API Credentials
    API_USERNAME: Optional[str] = None
    API_PASSWORD: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    
    # Flask Settings (for compatibility)
    FLASK_ENV: Optional[str] = None
    FLASK_APP: Optional[str] = None
    
    model_config = ConfigDict(
        env_file=".env",
        extra="allow"  # Allow extra fields
    )

settings = Settings()
