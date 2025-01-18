from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime, timedelta, timezone
from ..database import get_db
from ..models import Task, User
from ..schemas import TaskCreate, TaskResponse, TaskSummary
from ..services.auth import get_current_user
from ..config import settings

router = APIRouter(
    prefix="/tasks",
    tags=["tasks"]
)

@router.post("/", response_model=TaskResponse)
async def create_task(
    task: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Check for any ongoing tasks
    result = await db.execute(
        select(Task).where(
            Task.user_id == current_user.id,
            Task.end_time.is_(None)
        )
    )
    ongoing_task = result.scalar_one_or_none()
    
    if ongoing_task:
        # Auto-end the previous task
        ongoing_task.end_time = datetime.now(timezone.utc)
        ongoing_task.duration = int((ongoing_task.end_time - ongoing_task.start_time).total_seconds())
        db.add(ongoing_task)
    
    # Create new task
    new_task = Task(
        user_id=current_user.id,
        category=task.category,
        description=task.description,
        start_time=datetime.now(timezone.utc)
    )
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    return new_task

@router.put("/{task_id}/complete", response_model=TaskResponse)
async def complete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Task).where(
            Task.id == task_id,
            Task.user_id == current_user.id
        )
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task.end_time:
        raise HTTPException(status_code=400, detail="Task is already completed")
    
    task.end_time = datetime.now(timezone.utc)
    task.duration = int((task.end_time - task.start_time).total_seconds())
    
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task

@router.get("/", response_model=List[TaskResponse])
async def get_tasks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Task).where(Task.user_id == current_user.id)
    )
    tasks = result.scalars().all()
    return tasks

@router.get("/summary", response_model=TaskSummary)
async def get_daily_summary(
    date: datetime = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not date:
        date = datetime.now(timezone.utc)
    
    start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)
    
    result = await db.execute(
        select(Task).where(
            Task.user_id == current_user.id,
            Task.start_time >= start_of_day,
            Task.start_time < end_of_day
        )
    )
    tasks = result.scalars().all()
    
    total_duration = sum(task.duration or 0 for task in tasks)
    categories = {}
    for task in tasks:
        if task.category not in categories:
            categories[task.category] = 0
        categories[task.category] += task.duration or 0
    
    return TaskSummary(
        total_duration=total_duration,
        categories=categories,
        task_count=len(tasks)
    )
