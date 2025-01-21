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
        
        return JSONResponse(content=result)
    
    except HTTPException as e:
        logger.error(f"HTTP error: {str(e)}", exc_info=True)
        raise e
    except Exception as e:
        logger.error(f"Error processing audio: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        ) from e

@router.get("/audio", status_code=status.HTTP_200_OK)
async def get_audio_entries(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> JSONResponse:
    """
    Get paginated audio entries for the current user.
    """
    try:
        logger.info(f"Fetching audio entries for user {current_user.id}")
        
        # Query audio entries
        query = select(Audio).where(Audio.user_id == current_user.id)\
            .order_by(Audio.created_at.desc())\
            .offset(skip).limit(limit)
            
        result = await db.execute(query)
        entries = result.scalars().all()
        
        # Format response
        audio_entries = [{
            "id": entry.id,
            "transcribed_text": entry.transcribed_text,
            "created_at": entry.created_at
        } for entry in entries]
        
        return JSONResponse(content={"entries": audio_entries})
        
    except HTTPException as e:
        logger.error(f"HTTP error: {str(e)}", exc_info=True)
        raise e
    except Exception as e:
        logger.error(f"Error fetching audio entries: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        ) from e

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
        logger.info(f"Fetching audio entry {audio_id} for user {current_user.id}")
        
        # Query audio entry
        query = select(Audio).where(
            Audio.id == audio_id,
            Audio.user_id == current_user.id
        )
        result = await db.execute(query)
        audio = result.scalar_one_or_none()
        
        if not audio:
            logger.error(f"Audio entry {audio_id} not found for user {current_user.id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Audio entry not found"
            )
        
        return JSONResponse(content={
            "id": audio.id,
            "transcribed_text": audio.transcribed_text,
            "created_at": audio.created_at
        })
        
    except HTTPException as e:
        logger.error(f"HTTP error: {str(e)}", exc_info=True)
        raise e
    except Exception as e:
        logger.error(f"Error fetching audio entry: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        ) from e
