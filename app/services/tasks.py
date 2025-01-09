from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException
from ..models import Task
from ..config import settings

async def start_new_task(
    db: Session,
    user_id: int,
    category: str,
    description: str = ""
) -> Task:
    """
    Start a new task for the user
    """
    # Check for any ongoing tasks
    ongoing_task = db.query(Task).filter(
        Task.user_id == user_id,
        Task.end_time.is_(None)
    ).first()
    
    if ongoing_task:
        # Auto-end the previous task
        ongoing_task.end_time = datetime.utcnow()
        ongoing_task.duration = (ongoing_task.end_time - ongoing_task.start_time).total_seconds() / 3600
        db.add(ongoing_task)
    
    # Create new task
    new_task = Task(
        user_id=user_id,
        category=category,
        description=description,
        start_time=datetime.utcnow()
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task

async def end_current_task(
    db: Session,
    user_id: int
) -> Optional[Task]:
    """
    End the current ongoing task for the user
    """
    task = db.query(Task).filter(
        Task.user_id == user_id,
        Task.end_time.is_(None)
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="No ongoing task found")
    
    # Check if task has exceeded maximum duration
    max_duration = timedelta(hours=settings.MAX_SESSION_DURATION_HOURS)
    if datetime.utcnow() - task.start_time > max_duration:
        task.end_time = task.start_time + max_duration
    else:
        task.end_time = datetime.utcnow()
    
    task.duration = (task.end_time - task.start_time).total_seconds() / 3600
    db.add(task)
    db.commit()
    db.refresh(task)
    return task
