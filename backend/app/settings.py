"""
Application settings — all configuration sourced from environment variables.
"""
from typing import List
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
    # Accepts comma-separated string or JSON array in env vars
    ALLOWED_ORIGINS_STR: str = "http://localhost:3000"

    @property
    def ALLOWED_ORIGINS(self) -> List[str]:
        import json
        v = self.ALLOWED_ORIGINS_STR.strip()
        if v.startswith("["):
            return json.loads(v)
        return [o.strip() for o in v.split(",") if o.strip()]

    # ── Supabase ───────────────────────────────────────────────────────────────
    SUPABASE_URL: str = ""           # e.g. https://xyz.supabase.co
    SUPABASE_ANON_KEY: str = ""      # public anon key
    SUPABASE_JWT_SECRET: str = ""    # JWT secret for RS256 verification (Settings > API > JWT Secret)

    # ── Google OAuth (legacy — migrating to Supabase OAuth) ─────────────────
    GOOGLE_CLIENT_ID: str = ""  # empty = Google auth disabled

    # ── App ───────────────────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    # ── Anonymous demo / interaction-first landing ────────────────────────────
    # Master switch for the public demo pipeline. Prod starts `false` per rollout
    # plan; tests and dev default to `true` so the flow is exercised.
    PUBLIC_DEMO_ENABLED: bool = True
    FLYWHEEL_ENABLED: bool = True
    WELCOME_HANDOFF_ENABLED: bool = True
    # Daily cap on aggregate OpenAI cost for anonymous demo traffic. Worker
    # increments demo_cost_counter post-Whisper; /submit checks read-only.
    DAILY_DEMO_OPENAI_USD_CAP: float = 5.00
    # Salt for SHA-256 hashing of client IPs before logging/rate-limiting.
    # Rotate quarterly. Never empty in production.
    DEMO_IP_HASH_SALT: str = "test-salt-do-not-use-in-prod"
    # HMAC secret for the claim_token that survives the OAuth redirect. In
    # production this is 32 random bytes per environment.
    DEMO_CLAIM_HMAC_SECRET: str = "test-claim-hmac-secret-do-not-use-in-prod"
    # Cloudflare Turnstile (bot challenge on landing).
    TURNSTILE_SITE_KEY: str = ""
    TURNSTILE_SECRET_KEY: str = ""
    # Analytics.
    POSTHOG_API_KEY: str = ""
    # Operator alerting (cost-cap, sweep-stall). Empty disables alert delivery.
    SLACK_ALERT_WEBHOOK_URL: str = ""

    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
        "extra": "allow",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
