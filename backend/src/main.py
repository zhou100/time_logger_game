from fastapi import FastAPI, Request, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .models.user import Base
from .routes import auth, test, audio
import logging
from fastapi.responses import JSONResponse
import json
from fastapi.exceptions import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# Create FastAPI app
app = FastAPI(
    title="Time Logger Game API",
    description="API for the Time Logger Game application",
    version="1.0.0",
    debug=True
)

# Configure CORS
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
]

# Log CORS configuration
logger.debug(f"Configuring CORS with origins: {origins}")

# Add CORS middleware first, before any other middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Create SQLite database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create tables
Base.metadata.create_all(bind=engine)

# Simple test endpoint
@app.get("/hello")
async def hello():
    logger.debug("Hello endpoint called")
    return {"message": "Hello World"}

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    logger.debug("Root endpoint called")
    return {"message": "Welcome to the Time Logger Game API"}

# Logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    # Log request details
    logger.debug("=" * 50)
    logger.debug("Incoming Request Details:")
    logger.debug(f"Method: {request.method}")
    logger.debug(f"URL: {request.url}")
    logger.debug(f"Base URL: {request.base_url}")
    logger.debug(f"Path: {request.url.path}")
    logger.debug("Headers:")
    for name, value in request.headers.items():
        logger.debug(f"  {name}: {value}")
    
    try:
        response = await call_next(request)
        
        # Log response details
        logger.debug("Response Details:")
        logger.debug(f"Status Code: {response.status_code}")
        logger.debug("Headers:")
        for name, value in response.headers.items():
            logger.debug(f"  {name}: {value}")
        logger.debug("=" * 50)
        
        return response
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        raise

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.error(f"HTTP error occurred: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error occurred: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

# Create API router
api_router = APIRouter(prefix="/api")

# Include routers
api_router.include_router(test.router)
api_router.include_router(auth.router)
api_router.include_router(audio.router)

# Include the API router in the main app
app.include_router(api_router)

# Log startup message
@app.on_event("startup")
async def startup_event():
    logger.debug("FastAPI server starting up")
    logger.debug(f"CORS origins: {origins}")
    logger.debug(f"Database URL: {SQLALCHEMY_DATABASE_URL}")
    logger.debug("Registered routes:")
    for route in app.routes:
        logger.debug(f"  {route.path} [{route.methods}]")
