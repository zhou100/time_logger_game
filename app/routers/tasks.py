from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta
from ..database import get_db
from ..models import Task, User
from ..schemas import TaskCreate, TaskResponse, TaskSummary
from ..services.auth import get_current_user
from ..config import settings

router = APIRouter()

@router.post("/start", response_model=TaskResponse)
async def start_task(
    task: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Check for any ongoing tasks
    ongoing_task = db.query(Task).filter(
        Task.user_id == current_user.id,
        Task.end_time.is_(None)
    ).first()
    
    if ongoing_task:
        # Auto-end the previous task
        ongoing_task.end_time = datetime.utcnow()
        ongoing_task.duration = (ongoing_task.end_time - ongoing_task.start_time).total_seconds() / 3600
        db.add(ongoing_task)
    
    # Create new task
    new_task = Task(
        user_id=current_user.id,
        category=task.category,
        description=task.description,
        start_time=datetime.utcnow()
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task

@router.post("/end/{task_id}", response_model=TaskResponse)
async def end_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task.end_time:
        raise HTTPException(status_code=400, detail="Task already ended")
    
    task.end_time = datetime.utcnow()
    task.duration = (task.end_time - task.start_time).total_seconds() / 3600
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

@router.get("/summary/daily", response_model=List[TaskSummary])
async def get_daily_summary(
    date: datetime = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not date:
        date = datetime.utcnow()
    
    start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)
    
    tasks = db.query(Task).filter(
        Task.user_id == current_user.id,
        Task.start_time >= start_of_day,
        Task.start_time < end_of_day
    ).all()
    
    # Group by category and calculate total duration
    summary = {}
    for task in tasks:
        if task.category not in summary:
            summary[task.category] = 0
        if task.duration:
            summary[task.category] += task.duration
    
    return [TaskSummary(category=k, total_hours=v) for k, v in summary.items()]
