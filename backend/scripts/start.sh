#!/bin/bash

# Rewrite Render's postgresql:// URL to postgresql+asyncpg:// if needed
if [ -n "$DATABASE_URL" ]; then
  export DATABASE_URL=$(echo "$DATABASE_URL" | sed 's|^postgresql://|postgresql+asyncpg://|')
fi

# Wait for database to be ready
# Parse host from DATABASE_URL if DB_HOST not set explicitly
if [ -z "$DB_HOST" ] && [ -n "$DATABASE_URL" ]; then
  DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
fi
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
echo "Waiting for database at $DB_HOST:$DB_PORT..."
for i in $(seq 1 30); do
  nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null && break
  sleep 1
done
echo "Database is ready!"

# Run migrations
echo "Running database migrations..."
alembic upgrade head

# Start the FastAPI application
PORT="${PORT:-10000}"
echo "Starting FastAPI application on port $PORT..."
if [ "$ENVIRONMENT" = "development" ]; then
  uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --reload
else
  uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers 2
fi
