from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional, List
from datetime import datetime
from enum import Enum
from .models import TaskCategory, ContentCategory

class UserBase(BaseModel):
    email: EmailStr
    username: str

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

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
    duration: Optional[int] = None  # Duration in seconds
    model_config = ConfigDict(from_attributes=True)

class TaskSummary(BaseModel):
    category: TaskCategory
    total_hours: float

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str | None = None

class CategorizedEntryBase(BaseModel):
    category: ContentCategory
    content: str
    created_at: datetime

class CategorizedEntryCreate(CategorizedEntryBase):
    chat_history_id: int
    user_id: int

class CategorizedEntryResponse(CategorizedEntryBase):
    id: int
    chat_history_id: int
    user_id: int
    model_config = ConfigDict(from_attributes=True)

class ChatHistoryBase(BaseModel):
    text: str

class ChatHistoryCreate(ChatHistoryBase):
    user_id: int

class ChatHistoryResponse(ChatHistoryBase):
    id: int
    user_id: int
    text: str
    created_at: datetime
    categorized_entries: List[CategorizedEntryResponse]
    model_config = ConfigDict(from_attributes=True)

    @property
    def categories(self) -> List[str]:
        """Get unique categories from related entries."""
        return list(set(entry.category.value for entry in self.categorized_entries))

class EntriesResponse(BaseModel):
    entries: List[ChatHistoryResponse]
    total: int
