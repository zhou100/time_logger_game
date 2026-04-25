import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from .db import init_db, engine
from .settings import settings

from .routes.v1 import router as v1_router
from .routes.public_demo import router as public_demo_router

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up — initialising database and storage")
    if settings.ENVIRONMENT != "test":
        await init_db()

    # Ensure the storage bucket exists (no-op if already present)
    try:
        from .services.storage import ensure_bucket
        await ensure_bucket()
    except Exception as exc:
        logger.warning(f"Storage bucket init skipped: {exc}")

    # Initialise demo_cost_usd_today gauge with whatever is on disk so
    # `/metrics` returns a meaningful value before the first job lands.
    try:
        from datetime import datetime, timezone
        from sqlalchemy import select
        from .db import async_session
        from .models.demo import DemoCostCounter
        from .services.metrics import demo_cost_usd_today

        async with async_session() as cost_db:
            today = datetime.now(timezone.utc).date()
            res = await cost_db.execute(
                select(DemoCostCounter.cost_usd).where(DemoCostCounter.date == today)
            )
            v = res.scalar_one_or_none()
            demo_cost_usd_today.set(float(v) if v is not None else 0.0)
    except Exception as exc:
        logger.warning(f"demo_cost_usd_today init skipped: {exc}")

    # Start embedded worker loop as a background task
    from .services.worker import run_worker
    worker_task = asyncio.create_task(run_worker())
    logger.info("Embedded worker started")

    # Start anonymous demo TTL sweep (runs hourly). Lifecycle parallels
    # run_worker so shutdown cancels both.
    from .services.demo_sweep import run_demo_sweep
    demo_sweep_task = asyncio.create_task(run_demo_sweep(poll_interval=3600))
    logger.info("Demo sweep task started")

    yield

    logger.info("Shutting down")
    worker_task.cancel()
    demo_sweep_task.cancel()
    for t in (worker_task, demo_sweep_task):
        try:
            await t
        except asyncio.CancelledError:
            pass
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
app.include_router(v1_router, prefix="/api")
# Anonymous demo endpoints live at /v1/public/demo (no /api prefix; the
# landing page hits them before the user exists, so we want a short URL).
app.include_router(public_demo_router)


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


# ── Prometheus scrape endpoint ────────────────────────────────────────────────
# Standard scrape contract: no auth, plain-text format, served at the root
# of the deployment so a Prometheus job hitting `${BACKEND_URL}/metrics` just
# works. Importing prometheus_client here keeps the dependency optional —
# tests that touch this endpoint exercise the real path.
@app.get("/metrics")
async def prometheus_metrics():
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
    # Ensure metric instruments exist in the registry (Counter labels are
    # only emitted after their first .inc; importing the module is cheap).
    from .services import metrics as _metrics  # noqa: F401

    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )


# ── Global error handler ──────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {request.method} {request.url} — {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
