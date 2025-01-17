from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum as SQLAlchemyEnum
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import List
from .database import Base
from datetime import datetime, timezone, timedelta
from enum import Enum

class TaskCategory(str, Enum):
    TODO = "todo"
    MEETING = "meeting"
    BREAK = "break"
    OTHER = "other"

class ContentCategory(str, Enum):
    todo = "todo"
    idea = "idea"
    thought = "thought"
    time_record = "time_record"

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(unique=True, index=True)
    username: Mapped[str] = mapped_column(unique=True, index=True)
    hashed_password: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    tasks: Mapped[List["Task"]] = relationship(back_populates="user")
    chat_history: Mapped[List["ChatHistory"]] = relationship(back_populates="user")
    categorized_entries: Mapped[List["CategorizedEntry"]] = relationship(back_populates="user")

class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    category: Mapped[TaskCategory] = mapped_column(SQLAlchemyEnum(TaskCategory))
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration: Mapped[int | None] = mapped_column(nullable=True)  # Duration in seconds
    description: Mapped[str | None] = mapped_column(nullable=True)
    
    # Relationships
    user: Mapped["User"] = relationship(back_populates="tasks")

class ChatHistory(Base):
    __tablename__ = "chat_histories"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    user: Mapped["User"] = relationship(back_populates="chat_history")
    categorized_entries: Mapped[List["CategorizedEntry"]] = relationship(back_populates="chat_history", lazy="joined")

class CategorizedEntry(Base):
    __tablename__ = "categorized_entries"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    chat_history_id: Mapped[int] = mapped_column(ForeignKey("chat_histories.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    category: Mapped[ContentCategory] = mapped_column(SQLAlchemyEnum(ContentCategory))
    content: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    chat_history: Mapped["ChatHistory"] = relationship(back_populates="categorized_entries")
    user: Mapped["User"] = relationship(back_populates="categorized_entries")
