"""
Minimal test using async database
"""
import pytest
from sqlalchemy import select
from app.models import Audio

pytestmark = pytest.mark.asyncio

async def test_create_audio(test_db):
    """Test creating an audio entry"""
    # Create a new audio entry
    audio = Audio(transcribed_text="Test transcription")
    test_db.add(audio)
    await test_db.commit()
    
    # Query it back
    result = await test_db.execute(select(Audio).filter_by(transcribed_text="Test transcription"))
    audio_from_db = result.scalars().first()
    
    assert audio_from_db is not None
    assert audio_from_db.transcribed_text == "Test transcription"
