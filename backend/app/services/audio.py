"""
Audio processing service module.
"""
import logging
from typing import BinaryIO, List, Dict, Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.audio import Audio
from ..models.categories import CategorizedEntry, ContentCategory
from ..utils.transcription import get_transcription_service
from ..utils.categorization import get_categorization_service

# Configure logging
logger = logging.getLogger(__name__)

async def process_audio(
    audio_content: bytes,
    user_id: int,
    db: AsyncSession,
    language: str = "en"
) -> Dict:
    """
    Process audio file: transcribe, categorize, and save to database.
    
    Args:
        audio_content: Audio file content as bytes
        user_id: ID of the user who uploaded the audio
        db: Database session
        language: Language code for transcription (default: "en")
        
    Returns:
        Dict containing audio_id, transcribed_text, and categories
    """
    try:
        logger.info("Starting audio processing")
        
        # Get services
        transcription_service = get_transcription_service()
        categorization_service = get_categorization_service()
        
        # Transcribe audio
        transcribed_text = await transcription_service.transcribe_audio(audio_content, language)
        logger.info(f"Transcription successful: {transcribed_text}")
        
        # Save audio entry
        audio = Audio(
            transcribed_text=transcribed_text,
            user_id=user_id,
            created_at=datetime.now(timezone.utc)
        )
        db.add(audio)
        await db.commit()
        await db.refresh(audio)
        logger.info(f"Audio entry saved with ID: {audio.id}")
        
        # Categorize text
        categories = await categorization_service.categorize_text(transcribed_text)
        logger.info(f"Text categorized: {categories}")
        
        # Save categories
        for category_data in categories:
            entry = CategorizedEntry(
                text=category_data["content"],
                category=ContentCategory[category_data["category"].upper()],
                audio_id=audio.id,
                user_id=user_id,
                created_at=datetime.now(timezone.utc)
            )
            db.add(entry)
        
        await db.commit()
        logger.info("Categories saved to database")
        
        return {
            "audio_id": audio.id,
            "transcribed_text": transcribed_text,
            "categories": categories
        }
        
    except Exception as e:
        logger.error(f"Error processing audio: {str(e)}", exc_info=True)
        raise
