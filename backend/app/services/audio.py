"""
Audio processing service.
"""

import logging
import openai
from openai import AsyncOpenAI
from typing import Optional, Dict, Any
import os
from pathlib import Path
import tempfile
import aiofiles
from fastapi import UploadFile
from ..models.audio import Audio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..config import settings

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Configure OpenAI
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
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = temp_file.name
            
        logger.info(f"Writing file content to: {temp_path}")
        async with aiofiles.open(temp_path, 'wb') as out_file:
            content = await file.read()
            await out_file.write(content)
            
        logger.info(f"Successfully saved temporary file: {temp_path}")
        return temp_path
    except Exception as e:
        logger.error(f"Error saving temporary file: {str(e)}", exc_info=True)
        raise RuntimeError(f"Failed to save temporary file: {str(e)}")

async def transcribe_audio(file_path: str) -> str:
    """
    Transcribe audio file using OpenAI Whisper API.
    """
    try:
        logger.info(f"Starting audio transcription for file: {file_path}")
        
        logger.info("Opening audio file for transcription")
        with open(file_path, "rb") as audio_file:
            logger.info("Calling OpenAI Whisper API")
            response = await client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file
            )
            
        transcribed_text = response.text
        logger.info(f"Successfully transcribed audio. Length: {len(transcribed_text)} chars")
        return transcribed_text
        
    except Exception as e:
        logger.error(f"Error transcribing audio: {str(e)}", exc_info=True)
        raise RuntimeError(f"Failed to transcribe audio: {str(e)}")
    finally:
        try:
            os.unlink(file_path)
            logger.info(f"Cleaned up temporary file: {file_path}")
        except Exception as e:
            logger.warning(f"Failed to clean up temporary file {file_path}: {str(e)}")

async def save_audio(
    db: AsyncSession,
    user_id: int,
    transcribed_text: str
) -> Audio:
    """Save audio transcription to database."""
    try:
        logger.info(f"Saving audio transcription for user {user_id}")
        logger.info(f"Transcribed text length: {len(transcribed_text)}")
        
        audio = Audio(
            user_id=user_id,
            transcribed_text=transcribed_text
        )
        db.add(audio)
        await db.commit()
        await db.refresh(audio)
        logger.info(f"Successfully saved audio with ID: {audio.id}")
        return audio
    except Exception as e:
        logger.error(f"Error saving audio to database: {str(e)}", exc_info=True)
        await db.rollback()
        raise RuntimeError(f"Failed to save audio to database: {str(e)}")

async def process_audio(
    db: AsyncSession,
    user_id: int,
    file: UploadFile
) -> Dict[str, Any]:
    """
    Process audio file: save, transcribe, and categorize.
    """
    try:
        logger.info(f"Starting audio processing for user {user_id}")
        logger.info(f"File details - name: {file.filename}, content_type: {file.content_type}")
        
        # Save uploaded file
        temp_path = await save_temp_file(file)
        logger.info("File saved temporarily, proceeding with transcription")
        
        # Transcribe audio
        transcribed_text = await transcribe_audio(temp_path)
        logger.info("Audio transcribed successfully")
        
        # Save to database
        audio = await save_audio(db, user_id, transcribed_text)
        logger.info("Audio saved to database")
        
        return {
            "id": audio.id,
            "transcribed_text": transcribed_text,
            "created_at": audio.created_at.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error in audio processing pipeline: {str(e)}", exc_info=True)
        raise RuntimeError(f"Failed to process audio: {str(e)}")
