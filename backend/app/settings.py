"""
Application settings — all configuration sourced from environment variables.
"""
from typing import List
from pydantic import field_validator
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── JWT ──────────────────────────────────────────────────────────────────
    SECRET_KEY: str = "change-me-in-production-use-a-long-random-string"
    ALGORITHM: str = "HS256"
    # Access tokens are short-lived; refresh tokens stored in DB are long-lived.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 240
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/time_logger_game"
    TEST_DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/time_logger_test"
    DB_ECHO: bool = False           # Never True in production

    # ── OpenAI ───────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = "dummy"

    # ── Object Storage (Cloudflare R2 / S3-compatible) ─────────────────────────
    # R2 endpoint format: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
    # For local dev with MinIO: http://minio:9000
    S3_ENDPOINT_URL: str = "http://minio:9000"
    # Public URL reachable by browsers — replaces S3_ENDPOINT_URL in presigned URLs.
    # For R2: same as S3_ENDPOINT_URL. For local MinIO: http://localhost:9000
    S3_PUBLIC_ENDPOINT_URL: str = ""
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET: str = "time-logger-audio"
    S3_REGION: str = "auto"  # R2 uses "auto"; MinIO uses "us-east-1"

    # ── CORS ─────────────────────────────────────────────────────────────────
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    # ── Supabase ───────────────────────────────────────────────────────────────
    SUPABASE_URL: str = ""           # e.g. https://xyz.supabase.co
    SUPABASE_ANON_KEY: str = ""      # public anon key
    SUPABASE_JWT_SECRET: str = ""    # JWT secret for RS256 verification (Settings > API > JWT Secret)

    # ── Google OAuth (legacy — migrating to Supabase OAuth) ─────────────────
    GOOGLE_CLIENT_ID: str = ""  # empty = Google auth disabled

    # ── App ───────────────────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
        "extra": "allow",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
