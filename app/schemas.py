from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from .models import TaskCategory

class UserBase(BaseModel):
    email: EmailStr
    username: str

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    
    class Config:
        from_attributes = True

class TaskBase(BaseModel):
    category: TaskCategory
    description: Optional[str] = None

class TaskCreate(TaskBase):
    pass

class TaskResponse(TaskBase):
    id: int
    user_id: int
    start_time: datetime
    end_time: Optional[datetime] = None
    duration: Optional[float] = None
    
    class Config:
        from_attributes = True

class TaskSummary(BaseModel):
    category: TaskCategory
    total_hours: float
