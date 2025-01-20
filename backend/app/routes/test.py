from fastapi import APIRouter, Response
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/test",
    tags=["test"],
    responses={404: {"description": "Not found"}},
)

@router.get("/", response_model=dict)
async def test_endpoint():
    """Test endpoint to verify API connectivity"""
    logger.debug("Test endpoint called")
    return {"message": "Test successful"}
