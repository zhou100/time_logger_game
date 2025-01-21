"""
Database tests
"""
from app.models import Audio, CategorizedEntry, ContentCategory
import pytest
from datetime import datetime
import os
from sqlalchemy import select

@pytest.mark.asyncio
async def test_audio_creation(test_db, test_user):
    """Test creating an audio entry"""
    audio = Audio(
        transcribed_text="Test message",
        user_id=test_user.id,
        audio_path=os.path.join("tests", "fixtures", "audio", "test.mp3")
    )
    test_db.add(audio)
    await test_db.commit()
    await test_db.refresh(audio)

    assert audio.id is not None
    assert audio.transcribed_text == "Test message"
    assert audio.user_id == test_user.id
    assert audio.audio_path == os.path.join("tests", "fixtures", "audio", "test.mp3")
    assert isinstance(audio.created_at, datetime)

@pytest.mark.asyncio
async def test_categorized_entry_creation(test_db, test_user):
    """Test creating a categorized entry"""
    # First create an audio
    audio = Audio(
        transcribed_text="Test message",
        user_id=test_user.id
    )
    test_db.add(audio)
    await test_db.commit()

    # Now create a categorized entry
    entry = CategorizedEntry(
        text="Test entry",
        category=ContentCategory.TODO,
        audio_id=audio.id,
        user_id=test_user.id
    )
    test_db.add(entry)
    await test_db.commit()
    await test_db.refresh(entry)

    assert entry.id is not None
    assert entry.text == "Test entry"
    assert entry.category == ContentCategory.TODO
    assert entry.audio_id == audio.id
    assert isinstance(entry.created_at, datetime)

@pytest.mark.asyncio
async def test_audio_relationship(test_db, test_user):
    """Test the relationship between audio and categorized entries"""
    # Create an audio
    audio = Audio(
        transcribed_text="Test message",
        user_id=test_user.id
    )
    test_db.add(audio)
    await test_db.commit()

    # Create multiple entries
    entries = [
        CategorizedEntry(
            text=f"Test entry {i}",
            category=ContentCategory.TODO,
            audio_id=audio.id,
            user_id=test_user.id
        )
        for i in range(3)
    ]
    test_db.add_all(entries)
    await test_db.commit()

    # Query to get the entries
    result = await test_db.execute(
        select(CategorizedEntry).filter_by(audio_id=audio.id)
    )
    entries = result.scalars().all()
    assert len(entries) == 3
    assert all(entry.audio_id == audio.id for entry in entries)

    # Test cascade delete
    await test_db.delete(audio)
    await test_db.commit()

    # Check that entries were deleted
    result = await test_db.execute(
        select(CategorizedEntry).filter_by(audio_id=audio.id)
    )
    remaining_entries = result.scalars().all()
    assert len(remaining_entries) == 0

@pytest.mark.asyncio
async def test_user_relationship(test_db, test_user):
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
    await test_db.commit()

    # Query to get the audio entries
    result = await test_db.execute(
        select(Audio).filter_by(user_id=test_user.id)
    )
    audio_entries = result.scalars().all()
    assert len(audio_entries) == 3
    assert all(audio.user_id == test_user.id for audio in audio_entries)
