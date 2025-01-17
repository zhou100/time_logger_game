from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from ..database import get_db
from ..auth import get_current_user
from ..models import User
from ..services.audio import process_audio
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/audio",
    tags=["audio"]
)

@router.post("/upload")
async def upload_audio(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload an audio file for transcription and categorization
    
    Args:
        file: Audio file to process
        db: Database session
        current_user: Authenticated user
        
    Returns:
        Dictionary containing chat history ID, transcribed text, and categories
        
    Raises:
        HTTPException: If file format is invalid or processing fails
    """
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    # Validate file format
    if not file.content_type.startswith("audio/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Please upload an audio file."
        )

    try:
        # Read file content
        content = await file.read()
        
        # Process audio
        result = await process_audio(db, current_user.id, content)
        
        # Return response
        return {
            "chat_history_id": result.id,
            "text": result.text,
            "categories": [
                {
                    "category": entry.category,
                    "content": entry.content
                }
                for entry in result.categorized_entries
            ]
        }
        
    except HTTPException as e:
        # Re-raise HTTP exceptions with their original status code and detail
        raise
        
    except Exception as e:
        # Log unexpected errors and return a generic error message
        logger.error(f"Error processing audio upload: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing the audio file."
        )
    finally:
        await file.close()
