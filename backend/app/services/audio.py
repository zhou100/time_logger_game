"""
Audio processing service.
"""

import os
import logging
import tempfile
from pathlib import Path
import aiofiles
from typing import Dict, Any, Optional
from openai import AsyncOpenAI
from datetime import datetime, timezone

from fastapi import UploadFile
from ..models.audio import Audio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..config import settings
import time

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Initialize OpenAI client
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# Ensure we have a handler
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)

async def save_temp_file(file: UploadFile) -> str:
    """Save uploaded file to temporary location."""
    try:
        suffix = Path(file.filename).suffix
        logger.info(f"Creating temporary file with suffix: {suffix}")
        
        # Get the file content first
        try:
            content = await file.read()
            logger.info(f"Successfully read file content, size: {len(content)} bytes")
        except Exception as read_error:
            logger.error(f"Error reading file content: {str(read_error)}")
            raise
        
        # Create temp file and write content
        temp_dir = Path("/app/temp")
        temp_dir.mkdir(parents=True, exist_ok=True)
        temp_path = temp_dir / f"audio_{int(time.time())}{suffix}"
        
        logger.info(f"Writing file content to: {temp_path}")
        async with aiofiles.open(temp_path, 'wb') as out_file:
            await out_file.write(content)
            
        logger.info(f"Successfully saved temporary file: {temp_path}")
        return str(temp_path)
    except Exception as e:
        logger.error(f"Error saving temporary file: {str(e)}", exc_info=True)
        import traceback
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        raise RuntimeError(f"Failed to save temporary file: {str(e)}")

async def transcribe_audio(file_path: str) -> str:
    """Transcribe audio file using OpenAI Whisper API."""
    logger.info(f"Starting audio transcription for file: {file_path}")
    
    try:
        # Get file size
        file_size = os.path.getsize(file_path)
        logger.info(f"Audio file size: {file_size} bytes")
        
        # Open and read the file
        logger.info("Opening audio file for transcription")
        with open(file_path, "rb") as audio_file:
            # Call OpenAI API
            logger.info("Calling OpenAI Whisper API")
            response = await client.audio.transcriptions.create(
                file=audio_file,
                model="whisper-1"
            )
            
            logger.info("OpenAI API call successful")
            text = response.text
            logger.info(f"Successfully transcribed audio. Length: {len(text)} chars")
            
            # Clean up temp file
            try:
                os.remove(file_path)
                logger.info(f"Cleaned up temporary file: {file_path}")
            except Exception as cleanup_error:
                logger.warning(f"Failed to clean up temporary file {file_path}: {str(cleanup_error)}")
            
            return text
            
    except Exception as e:
        logger.error(f"Error transcribing audio: {str(e)}", exc_info=True)
        # Clean up temp file in case of error
        try:
            os.remove(file_path)
            logger.info(f"Cleaned up temporary file after error: {file_path}")
        except Exception as cleanup_error:
            logger.warning(f"Failed to clean up temporary file {file_path}: {str(cleanup_error)}")
        raise RuntimeError(f"Failed to transcribe audio: {str(e)}")

async def save_audio(db: AsyncSession, user_id: int, transcribed_text: str, file: UploadFile, temp_path: str) -> Audio:
    """Save audio metadata and transcription to database."""
    try:
        audio = Audio(
            user_id=user_id,
            transcribed_text=transcribed_text,
            filename=file.filename,
            content_type=file.content_type,
            file_path=temp_path,
            audio_path=temp_path,  # We store the same path for now
            updated_at=datetime.now(timezone.utc)
        )
        db.add(audio)
        await db.commit()
        await db.refresh(audio)
        return audio
    except Exception as e:
        logger.error(f"Error saving audio to database: {str(e)}", exc_info=True)
        raise RuntimeError(f"Failed to save audio to database: {str(e)}")

async def process_audio(db: AsyncSession, user_id: int, file: UploadFile) -> dict:
    """Process uploaded audio file and return transcription."""
    logger.info(f"Starting audio processing for user {user_id}")
    logger.info(f"File details - name: {file.filename}, content_type: {file.content_type}, size: {file.size}")
    
    try:
        # Save file to temp location
        temp_path = await save_temp_file(file)
        logger.info(f"File saved temporarily at {temp_path}, proceeding with transcription")
        
        # Transcribe audio
        transcribed_text = await transcribe_audio(temp_path)
        logger.info(f"Audio transcribed successfully: {transcribed_text}")
        
        # Save to database
        logger.info(f"Saving audio transcription for user {user_id}")
        logger.info(f"Transcribed text length: {len(transcribed_text)}")
        audio = await save_audio(db, user_id, transcribed_text, file, temp_path)
        
        return {
            "id": audio.id,
            "transcribed_text": audio.transcribed_text,
            "created_at": audio.created_at.isoformat(),
            "filename": audio.filename,
            "content_type": audio.content_type
        }
        
    except Exception as e:
        logger.error(f"Error in process_audio: {str(e)}", exc_info=True)
        raise RuntimeError(f"Failed to process audio: {str(e)}")
