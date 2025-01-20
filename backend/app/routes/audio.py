"""
Audio upload and processing routes.
"""
import os
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from ..utils.transcription import get_transcription_service
from ..utils.categorization import get_categorization_service
from ..models.audio import Audio
from ..models.categories import CategorizedEntry, ContentCategory
from ..database import get_db
from ..utils.auth import get_current_user
from ..models.user import User
from datetime import datetime, timezone

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

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
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="File must be an audio file"
            )
        
        # Read file content
        content = await file.read()
        
        # Transcribe audio
        transcription_service = get_transcription_service()
        transcribed_text = await transcription_service.transcribe_audio(content)
        logger.info(f"Transcribed text: {transcribed_text}")
        
        # Categorize text
        categorization_service = get_categorization_service()
        categories = await categorization_service.categorize_text(transcribed_text)
        logger.info(f"Categories: {categories}")
        
        # Save to database
        audio = Audio(
            transcribed_text=transcribed_text,
            user_id=current_user.id,
            created_at=datetime.now(timezone.utc)
        )
        db.add(audio)
        await db.commit()
        await db.refresh(audio)
        
        # Save categorized entries
        categorized_entries = []
        for category_data in categories:
            entry = CategorizedEntry(
                text=category_data["content"],
                category=ContentCategory[category_data["category"].upper()],
                audio_id=audio.id,
                user_id=current_user.id,
                created_at=datetime.now(timezone.utc)
            )
            categorized_entries.append(entry)
        
        if categorized_entries:
            db.add_all(categorized_entries)
            await db.commit()
        
        return JSONResponse(
            content={
                "audio_id": audio.id,
                "transcribed_text": transcribed_text,
                "categories": categories
            }
        )
    
    except Exception as e:
        logger.error(f"Error processing audio: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
