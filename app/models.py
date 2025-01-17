from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum, Float
from sqlalchemy.orm import relationship
from .database import Base
from datetime import datetime
import enum

class TaskCategory(str, enum.Enum):
    STUDY = "study"
    WORKOUT = "workout"
    FAMILY_TIME = "family_time"
    WORK = "work"
    HOBBY = "hobby"
    OTHER = "other"

class ContentCategory(str, enum.Enum):
    TODO = "todo"
    IDEA = "idea"
    THOUGHT = "thought"
    TIME_RECORD = "time_record"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    
    # Relationships
    tasks = relationship("Task", back_populates="user")
    chat_history = relationship("ChatHistory", back_populates="user")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    category = Column(Enum(TaskCategory))
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    duration = Column(Float, nullable=True)  # in hours
    description = Column(String, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="tasks")

class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    audio_path = Column(String, nullable=True)
    transcribed_text = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="chat_history")
    categorized_entries = relationship("CategorizedEntry", back_populates="chat_history")

class CategorizedEntry(Base):
    __tablename__ = "categorized_entries"

    id = Column(Integer, primary_key=True, index=True)
    chat_history_id = Column(Integer, ForeignKey("chat_history.id"))
    category = Column(Enum(ContentCategory))
    extracted_content = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    chat_history = relationship("ChatHistory", back_populates="categorized_entries")
