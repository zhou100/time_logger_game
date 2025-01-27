import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from .db import init_db, engine
from .routes import router, auth, users
from . import settings
from datetime import datetime
import jwt

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # Log to console
        logging.FileHandler('app.log')  # Log to file
    ]
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for FastAPI application."""
    # Startup
    logger.info("Initializing database")
    await init_db()
    yield
    # Shutdown
    logger.info("Shutting down application")
    await engine.dispose()

# Create FastAPI app
app = FastAPI(lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Authorization", "Content-Type"],  # Explicitly include auth headers
    expose_headers=["*"]
)

# Register routes
app.include_router(router, prefix="/api")  # This already includes the categories router
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")

# Debug endpoints
@app.post("/api/auth/verify")
async def verify_token(token: str = Body(...)):
    """Debug endpoint to verify token format and contents."""
    try:
        # Remove Bearer prefix if present
        if token.startswith("Bearer "):
            token = token[7:]

        # Decode without verification
        unverified_payload = jwt.decode(token, options={"verify_signature": False})
        logger.info(f"Unverified token payload: {unverified_payload}")

        # Now verify the token
        payload = jwt.decode(token, settings.settings.SECRET_KEY, algorithms=[settings.settings.ALGORITHM])
        logger.info(f"Verified token payload: {payload}")

        # Check expiration
        exp = datetime.fromtimestamp(payload["exp"])
        now = datetime.now()
        is_expired = exp <= now

        return {
            "valid": True,
            "payload": payload,
            "expiration": exp.isoformat(),
            "is_expired": is_expired,
            "time_until_expiry": str(exp - now) if not is_expired else "Expired"
        }
    except Exception as e:
        logger.error(f"Token verification failed: {str(e)}")
        return {
            "valid": False,
            "error": str(e),
            "token": token
        }

@app.get("/api/auth/debug")
async def debug_auth():
    """Debug endpoint to show auth settings."""
    return {
        "access_token_expire_minutes": settings.settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        "refresh_token_expire_days": settings.settings.REFRESH_TOKEN_EXPIRE_DAYS,
        "algorithm": settings.settings.ALGORITHM,
        "has_secret_key": bool(settings.settings.SECRET_KEY)
    }

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
        "cors": {
            "origins": ["http://localhost:3000"],
            "credentials": True
        },
        "auth": {
            "algorithm": settings.settings.ALGORITHM,
            "token_expire_minutes": settings.settings.ACCESS_TOKEN_EXPIRE_MINUTES
        }
    }

# Error handlers
@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Enhanced error logging for debugging."""
    logger.error(f"Unhandled exception in request to {request.url}")
    logger.error(f"Headers: {request.headers}")
    logger.error(f"Exception: {str(exc)}", exc_info=True)
    return {"message": "Internal server error", "detail": str(exc)}

@app.get("/")
async def hello():
    """Root endpoint."""
    return {"message": "Hello World"}
