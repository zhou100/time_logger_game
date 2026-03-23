"""
Entrypoint for the FastAPI backend.
Runs on both Docker (local dev) and Render (production).

Steps:
  1. Wait for the database to accept connections (retry with backoff)
  2. Run Alembic migrations
  3. Start uvicorn
"""
import subprocess
import sys
import time
import os


def wait_for_db(max_attempts: int = 30, delay: float = 2.0) -> None:
    """
    Probe the database with a lightweight sync connection.
    Works for both local Docker Postgres and managed providers (Supabase, Neon, etc.).
    Falls back to a short sleep if psycopg2 is unavailable.
    """
    db_url = os.environ.get("DATABASE_URL", "")
    # Convert async URL to sync for the probe
    sync_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    print("Waiting for database to be ready...")
    for attempt in range(1, max_attempts + 1):
        try:
            import sqlalchemy
            engine = sqlalchemy.create_engine(sync_url, pool_pre_ping=True)
            with engine.connect():
                pass
            engine.dispose()
            print(f"Database ready (attempt {attempt})")
            return
        except Exception as exc:
            print(f"  [{attempt}/{max_attempts}] Not ready yet: {exc}")
            time.sleep(delay)

    print("Database did not become ready in time — aborting")
    sys.exit(1)


def run_migrations() -> None:
    print("Running Alembic migrations...")
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
    )
    if result.stdout:
        print(result.stdout)
    if result.returncode != 0:
        print("Migration failed:", result.stderr)
        sys.exit(1)
    print("Migrations complete")


def start_server() -> None:
    port = os.environ.get("PORT", "10000")
    reload = os.environ.get("ENVIRONMENT", "production") == "development"
    cmd = [
        "uvicorn", "app.main:app",
        "--host", "0.0.0.0",
        "--port", port,
    ]
    if reload:
        cmd.append("--reload")
    print(f"Starting uvicorn on port {port} (reload={reload})")
    subprocess.run(cmd)


if __name__ == "__main__":
    wait_for_db()
    run_migrations()
    start_server()
