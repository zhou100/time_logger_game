"""
Audio upload and processing routes.
"""
import logging
import tempfile
from fastapi import APIRouter, UploadFile, HTTPException
from ..models.chat import ChatHistory
from ..database import SessionLocal
from ..utils.transcription import transcription_service
from ..utils.categorization import categorization_service

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

router = APIRouter(prefix="/api/audio")

@router.post("/upload")
async def upload_audio(file: UploadFile):
    """
    Upload and process audio file.
    
    Args:
        file: Audio file
        
    Returns:
        dict: Transcribed text and extracted categories
    """
    try:
        logger.info(f"Received audio upload request. Filename: {file.filename}, Content-Type: {file.content_type}")
        
        # Check if file is an audio file
        if not file.content_type.startswith('audio/'):
            raise HTTPException(status_code=400, detail="File must be an audio file")
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            logger.debug(f"Created temporary file: {temp_file.name}")
            # Write uploaded file to temporary file
            content = await file.read()
            temp_file.write(content)
            temp_file.flush()
            
            # Open the file for reading
            with open(temp_file.name, 'rb') as audio_file:
                logger.info("Starting audio transcription")
                transcribed_text = transcription_service.transcribe_audio(audio_file)
                logger.info(f"Audio transcription completed. Text length: {len(transcribed_text)}")
                
                try:
                    logger.info("Starting text categorization")
                    categories = categorization_service.categorize_text(transcribed_text)
                    logger.info(f"Text categorization completed. Found {len(categories)} categories")
                except Exception as e:
                    logger.error(f"Error during categorization: {str(e)}", exc_info=True)
                    # Continue with empty categories if categorization fails
                    categories = []
                
                # Save to database
                db = SessionLocal()
                try:
                    chat_history = ChatHistory(
                        transcribed_text=transcribed_text
                    )
                    db.add(chat_history)
                    db.commit()
                    db.refresh(chat_history)
                    logger.info(f"Saved to database with ID: {chat_history.id}")
                finally:
                    db.close()
                
                return {
                    "chat_history_id": chat_history.id,
                    "transcribed_text": transcribed_text,
                    "categories": categories
                }
                
    except Exception as e:
        logger.error(f"Error processing audio upload: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up the temporary file
        if temp_file and os.path.exists(temp_file.name):
            try:
                os.unlink(temp_file.name)
            except Exception as e:
                logger.error(f"Error cleaning up temporary file: {str(e)}")
