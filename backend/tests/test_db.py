"""
Database tests
"""
from app.models import Audio, CategorizedEntry, ContentCategory
import pytest
from datetime import datetime
import os

def test_audio_creation(test_db, test_user):
    """Test creating an audio entry"""
    audio = Audio(
        transcribed_text="Test message",
        user_id=test_user.id,
        audio_path=os.path.join("tests", "fixtures", "audio", "test.mp3")
    )
    test_db.add(audio)
    test_db.commit()
    test_db.refresh(audio)

    assert audio.id is not None
    assert audio.transcribed_text == "Test message"
    assert audio.user_id == test_user.id
    assert audio.audio_path == os.path.join("tests", "fixtures", "audio", "test.mp3")
    assert isinstance(audio.created_at, datetime)

def test_categorized_entry_creation(test_db, test_user):
    """Test creating a categorized entry"""
    # First create an audio
    audio = Audio(
        transcribed_text="Test message",
        user_id=test_user.id
    )
    test_db.add(audio)
    test_db.commit()

    # Now create a categorized entry
    entry = CategorizedEntry(
        text="Test entry",
        category=ContentCategory.TODO,
        audio_id=audio.id
    )
    test_db.add(entry)
    test_db.commit()
    test_db.refresh(entry)

    assert entry.id is not None
    assert entry.text == "Test entry"
    assert entry.category == ContentCategory.TODO
    assert entry.audio_id == audio.id
    assert isinstance(entry.created_at, datetime)

def test_audio_relationship(test_db, test_user):
    """Test the relationship between audio and categorized entries"""
    # Create an audio
    audio = Audio(
        transcribed_text="Test message",
        user_id=test_user.id
    )
    test_db.add(audio)
    test_db.commit()

    # Create multiple entries
    entries = [
        CategorizedEntry(
            text=f"Test entry {i}",
            category=ContentCategory.TODO,
            audio_id=audio.id
        )
        for i in range(3)
    ]
    test_db.add_all(entries)
    test_db.commit()

    # Refresh to get the relationship
    test_db.refresh(audio)

    assert len(audio.entries) == 3
    assert all(entry.audio_id == audio.id for entry in audio.entries)

    # Test cascade delete
    test_db.delete(audio)
    test_db.commit()
    test_db.flush()

    # Check that entries were deleted
    remaining_entries = test_db.execute(
        select(CategorizedEntry).filter_by(audio_id=audio.id)
    ).scalars().all()
    assert len(remaining_entries) == 0

def test_user_relationship(test_db, test_user):
    """Test the relationship between user and audios"""
    # Create multiple audios for the user
    audios = [
        Audio(
            transcribed_text=f"Test message {i}",
            user_id=test_user.id
        )
        for i in range(3)
    ]
    test_db.add_all(audios)
    test_db.commit()

    # Refresh to get the relationship
    test_db.refresh(test_user)

    assert len(test_user.audios) == 3
    assert all(a.user_id == test_user.id for a in test_user.audios)
    assert all(isinstance(a.created_at, datetime) for a in test_user.audios)
    assert all(
        a1.created_at <= a2.created_at
        for a1, a2 in zip(test_user.audios[:-1], test_user.audios[1:])
    )
