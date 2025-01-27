"""
Audio upload and processing routes.
"""
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from ..services.audio import process_audio
from ..models.audio import Audio
from ..db import get_db
from ..utils.auth import get_current_user
from ..models.user import User
from datetime import datetime, timezone

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

router = APIRouter()

@router.post("/audio/upload", status_code=status.HTTP_200_OK)
async def upload_audio(
    file: UploadFile = File(...), 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> JSONResponse:
    """
    Upload and process an audio file.
    """
    try:
        # Log file details
        logger.info(f"Received file: {file.filename}, content_type: {file.content_type}")
        
        # Check if file is an audio file
        if not file.content_type.startswith('audio/'):
            logger.error(f"Invalid content type: {file.content_type}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail=f"File must be an audio file, got {file.content_type}"
            )
        
        # Process audio using service
        result = await process_audio(db, current_user.id, file)
        
        # Ensure all datetime objects are serialized
        if isinstance(result.get('created_at'), datetime):
            result['created_at'] = result['created_at'].isoformat()
        if isinstance(result.get('updated_at'), datetime):
            result['updated_at'] = result['updated_at'].isoformat()
        
        return JSONResponse(content=result)
    
    except HTTPException as e:
        logger.error(f"HTTP error: {str(e)}", exc_info=True)
        raise e
    except Exception as e:
        logger.error(f"Error processing audio: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server error. Please try again later."
        )

@router.get("/audio", status_code=status.HTTP_200_OK)
async def get_audio_entries(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> JSONResponse:
    """
    Get paginated list of audio entries for the current user.
    """
    try:
        query = (
            select(Audio)
            .where(Audio.user_id == current_user.id)
            .order_by(Audio.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        
        result = await db.execute(query)
        entries = result.scalars().all()
        
        # Convert entries to dict with proper datetime handling
        audio_entries = [entry.to_dict() for entry in entries]
        
        return JSONResponse(content={"entries": audio_entries})
        
    except Exception as e:
        logger.error(f"Error fetching audio entries: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server error. Please try again later."
        )

@router.get("/audio/{audio_id}", status_code=status.HTTP_200_OK)
async def get_audio_entry(
    audio_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> JSONResponse:
    """
    Get a specific audio entry by ID.
    """
    try:
        # Get audio entry
        query = select(Audio).where(Audio.id == audio_id)
        result = await db.execute(query)
        audio = result.scalar_one_or_none()
        
        # Check if audio exists
        if not audio:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Audio entry {audio_id} not found"
            )
        
        # Check if user owns this audio
        if audio.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this audio entry"
            )
        
        return JSONResponse(content=audio.to_dict())
        
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error fetching audio entry: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server error. Please try again later."
        )
