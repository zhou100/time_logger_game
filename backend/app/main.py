import logging
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .db import init_db, engine
from .settings import settings

# Legacy v0 routes (kept for backward-compatibility)
from .routes import router as legacy_router
from .routes import auth as legacy_auth
from .routes import users as legacy_users

# New versioned routes
from .routes.v1 import router as v1_router

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up — initialising database and storage")
    await init_db()

    # Ensure the MinIO bucket exists (no-op if already present)
    try:
        from .services.storage import ensure_bucket
        await ensure_bucket()
    except Exception as exc:
        logger.warning(f"Storage bucket init skipped: {exc}")

    yield

    logger.info("Shutting down")
    await engine.dispose()


app = FastAPI(
    title="Time Logger API",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Authorization", "Content-Type"],
    expose_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
# New versioned API — primary surface
app.include_router(v1_router, prefix="/api")

# Legacy routes — kept during migration, will be removed in a future version
app.include_router(legacy_router, prefix="/api")
app.include_router(legacy_auth.router, prefix="/api")
app.include_router(legacy_users.router, prefix="/api")


# ── Utility endpoints ─────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "version": app.version,
        "environment": settings.ENVIRONMENT,
    }


@app.get("/")
async def root():
    return {"message": "Time Logger API", "docs": "/docs"}


# ── Global error handler ──────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {request.method} {request.url} — {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
