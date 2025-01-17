import os
import logging
from datetime import datetime, timezone
from typing import Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from openai import AsyncOpenAI, OpenAIError
from .categorization import categorize_text
from ..models import ChatHistory, CategorizedEntry, ContentCategory
from fastapi import HTTPException
import tempfile

# Configure logging
logger = logging.getLogger(__name__)

# Initialize OpenAI client
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

async def transcribe_audio(audio_data: bytes) -> str:
    """
    Transcribe audio data to text using OpenAI's Whisper API
    
    Args:
        audio_data: Raw audio data bytes
        
    Returns:
        Transcribed text
        
    Raises:
        HTTPException: If transcription fails
    """
    try:
        # Save audio data to temporary file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as temp_file:
            temp_file.write(audio_data)
            temp_file.seek(0)
            
            # Transcribe using OpenAI API
            response = await client.audio.transcriptions.create(
                file=temp_file,
                model="whisper-1"
            )
            
            return response.text
            
    except Exception as e:
        logger.error(f"Error transcribing audio: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Transcription failed"
        )

async def save_chat_history(db: AsyncSession, user_id: int, text: str) -> ChatHistory:
    """
    Save chat history to database
    """
    chat_history = ChatHistory(
        text=text,
        user_id=user_id,
        created_at=datetime.now(timezone.utc)
    )
    db.add(chat_history)
    await db.commit()
    await db.refresh(chat_history)
    return chat_history

async def process_audio(db: AsyncSession, user_id: int, audio_data: bytes) -> ChatHistory:
    """
    Process audio data by transcribing it and categorizing the text.
    
    Args:
        db: Database session
        user_id: ID of the user who uploaded the audio
        audio_data: Raw audio data bytes
        
    Returns:
        ChatHistory object with transcribed text and categorized entries
        
    Raises:
        HTTPException: If there's an error processing the audio
    """
    try:
        # Transcribe audio
        transcription = await transcribe_audio(audio_data)
        
        # Save chat history
        chat_history = await save_chat_history(db, user_id, transcription)
        
        # Only categorize if there's non-empty text
        if transcription.strip():
            # Categorize text
            categories = await categorize_text(transcription)
            
            if categories:
                # Create categorized entries
                entries = []
                for cat in categories:
                    if not isinstance(cat, dict):
                        logger.warning(f"Invalid category format: {cat}")
                        continue
                        
                    category = cat.get("category")
                    content = cat.get("content")
                    
                    if not category or not content:
                        logger.warning(f"Missing category or content: {cat}")
                        continue
                        
                    # Validate category
                    try:
                        if category not in [c.value for c in ContentCategory]:
                            logger.warning(f"Invalid category value: {category}")
                            continue
                            
                        entry = CategorizedEntry(
                            chat_history_id=chat_history.id,
                            user_id=user_id,
                            category=category,
                            content=content
                        )
                        entries.append(entry)
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Error creating entry for category {category}: {str(e)}")
                        continue
                
                if entries:
                    db.add_all(entries)
                    await db.commit()
                    await db.refresh(chat_history)
        
        return chat_history
        
    except Exception as e:
        logger.error(f"Error processing audio: {str(e)}")
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=500,
            detail=f"Error processing audio: {str(e)}"
        )
