from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from .database import engine
from .models.base import Base
from .routes import audio, auth
import logging
from fastapi.responses import JSONResponse
import json
from fastapi.exceptions import HTTPException

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Context manager for FastAPI app. It will run all code before yield on startup
    and all code after yield on shutdown.
    """
    logger.debug("FastAPI server starting up")
    logger.debug("Registered routes:")
    for route in app.routes:
        logger.debug(f"  {route.path} [{route.methods}]")
    
    # Create tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Clean up resources on shutdown
    await engine.dispose()

app = FastAPI(lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging middleware
class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Log request
        logger.debug(f"Request: {request.method} {request.url}")
        
        # Process request and get response
        response = await call_next(request)
        
        # Log response
        logger.debug(f"Response: {response.status_code}")
        
        return response

app.add_middleware(LoggingMiddleware)

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

# Include routers
app.include_router(auth.router, prefix="/api")
app.include_router(audio.router, prefix="/api")

# Simple test endpoint
@app.get("/hello")
def hello():
    """Test endpoint"""
    return {"message": "Hello World"}
