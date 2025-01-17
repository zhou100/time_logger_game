from fastapi import UploadFile, HTTPException, status
import tempfile
import os
import openai
import json
from typing import Dict
import shutil
import mimetypes
import logging

logger = logging.getLogger(__name__)

ALLOWED_AUDIO_FORMATS = {'audio/flac', 'audio/x-m4a', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 
                        'audio/ogg', 'audio/wav', 'audio/webm'}

async def transcribe_audio(audio: UploadFile) -> str:
    """
    Transcribe audio using OpenAI's Whisper API
    """
    logger.info(f"Processing audio file: {audio.filename}")
    logger.info(f"Content type from file: {audio.content_type}")
    logger.info(f"Headers: {audio.headers}")
    
    # Validate file format
    content_type = audio.content_type or mimetypes.guess_type(audio.filename)[0]
    logger.info(f"Initial content type: {content_type}")
    
    if not content_type:
        # Try to get content type from headers
        content_type = audio.headers.get("content-type")
        logger.info(f"Content type from headers: {content_type}")
    
    # Normalize content type
    if content_type == "audio/mp3":
        content_type = "audio/mpeg"
        logger.info("Normalized audio/mp3 to audio/mpeg")
    
    if not content_type or content_type not in ALLOWED_AUDIO_FORMATS:
        error_msg = f"Invalid file format. Supported formats: {list(ALLOWED_AUDIO_FORMATS)}"
        logger.error(f"{error_msg} (got {content_type})")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # Create a temporary file to store the audio
    temp_dir = tempfile.mkdtemp()
    temp_file_path = os.path.join(temp_dir, "audio.mp3")
    
    try:
        # Read and write the file content
        content = await audio.read()
        logger.info(f"Read {len(content)} bytes from audio file")
        
        with open(temp_file_path, "wb") as temp_file:
            temp_file.write(content)
        
        # Open the file and transcribe
        with open(temp_file_path, "rb") as audio_file:
            transcript = await openai.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="text"
            )
        return transcript.text
    except Exception as e:
        logger.error(f"Error in transcribe_audio: {str(e)}")
        raise
    finally:
        # Clean up the temporary directory and all its contents
        try:
            shutil.rmtree(temp_dir)
        except Exception as e:
            logger.warning(f"Could not delete temporary directory {temp_dir}: {str(e)}")

async def classify_task(text: str) -> Dict[str, str]:
    """
    Use GPT-3.5-turbo to classify if text contains a task command
    Returns a dictionary with action type and details
    """
    prompt = f"""
    Analyze the following text and determine if it's a task-related command.
    If it's about starting a task, return a JSON with action "start", the task category, and description.
    If it's about ending a task, return a JSON with action "end".
    If it's not a task command, return a JSON with action "none".
    
    Example formats:
    {{"action": "start", "category": "work", "description": "coding the new feature"}}
    {{"action": "end"}}
    {{"action": "none"}}
    
    Text to analyze: {text}
    """
    
    try:
        response = openai.ChatCompletion.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that classifies task-related commands."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
        )
        
        # Parse the response
        response_content = response.choices[0].message.content
        task_info = json.loads(response_content)
        return task_info
    except Exception as e:
        logger.error(f"Error in task classification: {str(e)}")
        return {"action": "none"}
