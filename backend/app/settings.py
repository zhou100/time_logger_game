"""
Application settings and configuration.
"""
from pydantic import BaseModel, ConfigDict
from pydantic_settings import BaseSettings
from functools import lru_cache
import secrets

class Settings(BaseSettings):
    """Application settings."""
    # JWT Settings
    SECRET_KEY: str = "${SECRET_KEY:-your-256-bit-secret-key-keep-it-safe}"  # Override this in production
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 240  # 4 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30     # 30 days

    # Database Settings
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/time_logger_game"
    TEST_DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/time_logger_test"

    model_config = ConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="allow"  # Allow extra fields from environment
    )

@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

settings = get_settings()
