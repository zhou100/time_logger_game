"""
API routes
"""
"""
Routes initialization
"""
from fastapi import APIRouter
from .categories import router as categories_router
from .audio import router as audio_router

# Create main router
router = APIRouter()

# Include sub-routers
router.include_router(categories_router)
router.include_router(audio_router, tags=["audio"])

__all__ = ['router']
