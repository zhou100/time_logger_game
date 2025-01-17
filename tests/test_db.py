import pytest
from datetime import datetime
from app.models import ChatHistory, CategorizedEntry, ContentCategory
from sqlalchemy import select

def test_chat_history_creation(test_db, test_user):
    chat_history = ChatHistory(
        user_id=test_user.id,
        transcribed_text="Test transcription",
        audio_path="test.mp3"
    )
    test_db.add(chat_history)
    test_db.commit()
    test_db.refresh(chat_history)
    
    assert chat_history.id is not None
    assert chat_history.user_id == test_user.id
    assert chat_history.transcribed_text == "Test transcription"
    assert chat_history.audio_path == "test.mp3"
    assert isinstance(chat_history.created_at, datetime)

def test_categorized_entry_creation(test_db, test_user):
    # Create chat history first
    chat_history = ChatHistory(
        user_id=test_user.id,
        transcribed_text="Test transcription"
    )
    test_db.add(chat_history)
    test_db.commit()
    
    # Create categorized entry
    entry = CategorizedEntry(
        chat_history_id=chat_history.id,
        category=ContentCategory.TODO,
        extracted_content="Test todo item"
    )
    test_db.add(entry)
    test_db.commit()
    test_db.refresh(entry)
    
    assert entry.id is not None
    assert entry.chat_history_id == chat_history.id
    assert entry.category == ContentCategory.TODO
    assert entry.extracted_content == "Test todo item"
    assert isinstance(entry.created_at, datetime)

def test_chat_history_relationship(test_db, test_user):
    # Create chat history with categorized entries
    chat_history = ChatHistory(
        user_id=test_user.id,
        transcribed_text="Test transcription"
    )
    test_db.add(chat_history)
    test_db.commit()
    
    entries = [
        CategorizedEntry(
            chat_history_id=chat_history.id,
            category=category,
            extracted_content=f"Test {category.value}"
        )
        for category in [ContentCategory.TODO, ContentCategory.IDEA]
    ]
    test_db.add_all(entries)
    test_db.commit()
    
    # Test relationships
    test_db.refresh(chat_history)
    assert len(chat_history.categorized_entries) == 2
    assert chat_history.user == test_user
    
    # Test cascade delete
    test_db.delete(chat_history)
    test_db.commit()
    test_db.flush()
    
    # Verify entries are deleted
    remaining_entries = test_db.execute(
        select(CategorizedEntry).where(CategorizedEntry.chat_history_id == chat_history.id)
    ).scalars().all()
    assert len(remaining_entries) == 0

def test_user_relationship(test_db, test_user):
    # Create multiple chat histories for user
    chat_histories = [
        ChatHistory(
            user_id=test_user.id,
            transcribed_text=f"Test transcription {i}"
        )
        for i in range(3)
    ]
    test_db.add_all(chat_histories)
    test_db.commit()
    
    # Test user relationship
    test_db.refresh(test_user)
    assert len(test_user.chat_history) == 3
    
    # Test ordering by created_at
    assert all(
        h1.created_at <= h2.created_at
        for h1, h2 in zip(test_user.chat_history[:-1], test_user.chat_history[1:])
    )
