from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import Optional, List
from ..database import get_db
from ..models import User, ContentCategory
from ..services.auth import get_current_user
from ..services.audio import transcribe_audio, classify_task
from ..services.tasks import start_new_task, end_current_task
from ..services.categorization import save_chat_history, get_category_entries
from ..schemas import ChatHistoryResponse, CategorizedEntryResponse
import logging

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/audio/process", response_model=ChatHistoryResponse)
async def process_audio(
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        logger.info(f"Processing audio request from user {current_user.email}")
        logger.info(f"Audio file details - Name: {audio.filename}, Content-Type: {audio.content_type}")
        
        # Save audio file temporarily and transcribe
        transcribed_text = await transcribe_audio(audio)
        logger.info("Audio transcription successful")
        
        # Save transcription and categorize
        chat_history = await save_chat_history(
            db=db,
            user_id=current_user.id,
            transcribed_text=transcribed_text
        )
        logger.info("Successfully saved chat history to database")
        
        # Check if it's a task-related command
        try:
            task_info = await classify_task(transcribed_text)
            if task_info["action"] == "start":
                await start_new_task(
                    db=db,
                    user_id=current_user.id,
                    category=task_info["category"],
                    description=task_info["description"]
                )
            elif task_info["action"] == "end":
                await end_current_task(
                    db=db,
                    user_id=current_user.id
                )
        except Exception as e:
            logger.error(f"Error processing task command: {str(e)}")
        
        return chat_history
    except Exception as e:
        logger.error(f"Error processing audio: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/categories/{category}", response_model=List[CategorizedEntryResponse])
async def get_entries_by_category(
    category: ContentCategory,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        logger.info(f"Fetching entries for category {category} for user {current_user.email}")
        entries = await get_category_entries(db, current_user.id, category)
        logger.info(f"Found {len(entries)} entries")
        if not entries:
            return []
        return entries
    except Exception as e:
        logger.error(f"Error fetching entries by category: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/categories", response_model=List[CategorizedEntryResponse])
async def get_all_entries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        logger.info(f"Fetching all entries for user {current_user.email}")
        entries = await get_category_entries(db, current_user.id)
        logger.info(f"Found {len(entries)} total entries")
        if not entries:
            return []
        return entries
    except Exception as e:
        logger.error(f"Error fetching all entries: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
