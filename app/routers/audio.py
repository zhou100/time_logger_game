from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User
from ..services.auth import get_current_user
from ..services.audio import transcribe_audio, classify_task
from ..services.tasks import start_new_task, end_current_task

router = APIRouter()

@router.post("/process")
async def process_audio(
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        # Save audio file temporarily and transcribe
        transcription = await transcribe_audio(audio)
        
        # Classify the transcribed text
        task_info = await classify_task(transcription)
        
        if task_info["action"] == "start":
            # Start a new task
            task = await start_new_task(
                db=db,
                user_id=current_user.id,
                category=task_info["category"],
                description=task_info.get("description", "")
            )
            return {
                "message": "Task started successfully",
                "task": task,
                "transcription": transcription
            }
        elif task_info["action"] == "end":
            # End the current task
            task = await end_current_task(db=db, user_id=current_user.id)
            return {
                "message": "Task ended successfully",
                "task": task,
                "transcription": transcription
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not determine task action from audio"
            )
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
