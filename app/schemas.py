from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from .models import TaskCategory, ContentCategory

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

class CategorizedEntryBase(BaseModel):
    category: ContentCategory
    extracted_content: str

class CategorizedEntryCreate(CategorizedEntryBase):
    chat_history_id: int

class CategorizedEntryResponse(CategorizedEntryBase):
    id: int
    chat_history_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class ChatHistoryBase(BaseModel):
    transcribed_text: str
    audio_path: Optional[str] = None

class ChatHistoryCreate(ChatHistoryBase):
    pass

class ChatHistoryResponse(ChatHistoryBase):
    id: int
    user_id: int
    created_at: datetime
    categorized_entries: List[CategorizedEntryResponse] = []
    
    class Config:
        from_attributes = True
