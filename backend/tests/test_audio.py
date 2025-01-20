import pytest
from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, patch, MagicMock
from .conftest import test_user, async_client, auth_async_client, test_db
from app.models import Audio, CategorizedEntry, ContentCategory
from app.services.audio import process_audio
from app.services.categorization import categorize_text
from datetime import datetime, timezone
import os

@pytest.mark.asyncio
async def test_transcribe_audio_mock():
    # Test implementation...
    pass

@pytest.mark.asyncio
async def test_classify_task_mock():
    # Test implementation...
    pass

@pytest.mark.asyncio
async def test_save_audio(test_db):
    # Create test data
    transcribed_text = "Test transcription"
    user_id = 1

    # Save audio
    async with test_db as session:
        audio = Audio(
            transcribed_text=transcribed_text,
            user_id=user_id,
            created_at=datetime.now(timezone.utc)
        )
        session.add(audio)
        await session.commit()
        await session.refresh(audio)

        # Query the saved audio using unique()
        result = await session.execute(
            select(Audio).where(Audio.id == audio.id)
        )
        saved_audio = result.unique().scalar_one()

        assert saved_audio.transcribed_text == transcribed_text
        assert saved_audio.user_id == user_id

@pytest.mark.asyncio
async def test_process_audio_endpoint_integration(auth_async_client, test_user):
    # Create test audio file
    test_file = {
        "file": (os.path.join("tests", "fixtures", "audio", "test.mp3"), b"test audio content", "audio/mpeg")
    }

    # Mock OpenAI API call
    mock_response = MagicMock()
    mock_response.text = "Test transcription"
    
    mock_categorize = AsyncMock()
    mock_categorize.return_value = [{"category": "todo", "content": "Test todo"}]
    
    with patch('app.services.audio.client.audio.transcriptions.create', return_value=mock_response), \
         patch('app.services.categorization.categorize_text', new=mock_categorize):
        # Send request
        response = await auth_async_client.post(
            "/api/audio/upload",
            files=test_file
        )

        # Check response
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "audio_id" in data
        assert "transcribed_text" in data
        assert "categories" in data
        assert isinstance(data["categories"], list)

@pytest.mark.asyncio
async def test_process_audio_endpoint_invalid_format(auth_async_client, test_user):
    # Create invalid file
    test_file = {
        "file": ("test.txt", b"not an audio file", "text/plain")
    }

    # Send request
    response = await auth_async_client.post(
        "/api/audio/upload",
        files=test_file
    )

    # Check response
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    data = response.json()
    assert "Invalid file format" in data["detail"]

@pytest.mark.asyncio
async def test_process_audio_endpoint_transcription_error(auth_async_client, test_user):
    # Mock transcription error
    with patch('app.services.audio.client.audio.transcriptions.create', side_effect=Exception("Transcription failed")):
        test_file = {
            "file": (os.path.join("tests", "fixtures", "audio", "test.mp3"), b"test audio content", "audio/mpeg")
        }

        # Send request
        response = await auth_async_client.post(
            "/api/audio/upload",
            files=test_file
        )

        # Check response
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "Transcription failed" in response.json()["detail"]

@pytest.mark.asyncio
async def test_process_audio_endpoint_unauthorized(async_client):
    # Create test audio file
    test_file = {
        "file": (os.path.join("tests", "fixtures", "audio", "test.mp3"), b"test audio content", "audio/mpeg")
    }

    # Send request without auth token
    response = await async_client.post(
        "/api/audio/upload",
        files=test_file
    )

    # Check response
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert "Not authenticated" in data["detail"]

@pytest.mark.asyncio
async def test_process_audio(test_user, test_db):
    # Mock data
    mock_transcription = "Test transcription"
    mock_categories = [{"category": "todo", "content": "Test todo"}]
    audio_data = b"test audio content"

    # Mock OpenAI API call
    mock_response = MagicMock()
    mock_response.text = mock_transcription

    mock_categorize = AsyncMock()
    mock_categorize.return_value = mock_categories

    with patch('app.services.audio.client.audio.transcriptions.create', return_value=mock_response), \
         patch('app.services.audio.categorize_text', new=mock_categorize):
        
        result = await process_audio(test_db, test_user.id, audio_data)

        # Verify transcription
        assert result.transcribed_text == mock_transcription
        
        # Verify that categorize_text was called with correct args
        mock_categorize.assert_called_once_with(mock_transcription)
        
        # Verify categorized entries
        assert len(result.categorized_entries) == 1
        entry = result.categorized_entries[0]
        assert entry.text == "Test todo"
        assert entry.category == ContentCategory.todo
        assert entry.user_id == test_user.id
        assert entry.audio_id == result.id

@pytest.mark.asyncio
async def test_process_audio_with_empty_categories(test_user, test_db):
    # Mock data
    mock_transcription = "Test transcription"
    mock_categories = []
    audio_data = b"test audio content"

    # Mock OpenAI API call
    mock_response = MagicMock()
    mock_response.text = mock_transcription

    mock_categorize = AsyncMock()
    mock_categorize.return_value = mock_categories

    with patch('app.services.audio.client.audio.transcriptions.create', return_value=mock_response), \
         patch('app.services.audio.categorize_text', new=mock_categorize):
        
        result = await process_audio(test_db, test_user.id, audio_data)

        # Verify transcription
        assert result.transcribed_text == mock_transcription
        
        # Verify that categorize_text was called with correct args
        mock_categorize.assert_called_once_with(mock_transcription)
        
        # Verify no categorized entries were created
        assert len(result.categorized_entries) == 0

@pytest.mark.asyncio
async def test_process_audio_with_invalid_categories(test_user, test_db):
    # Mock data
    mock_transcription = "Test transcription"
    mock_categories = [{"category": "invalid", "content": "Test content"}]
    audio_data = b"test audio content"

    # Mock OpenAI API call
    mock_response = MagicMock()
    mock_response.text = mock_transcription

    mock_categorize = AsyncMock()
    mock_categorize.return_value = mock_categories

    with patch('app.services.audio.client.audio.transcriptions.create', return_value=mock_response), \
         patch('app.services.audio.categorize_text', new=mock_categorize):
        
        result = await process_audio(test_db, test_user.id, audio_data)

        # Verify transcription
        assert result.transcribed_text == mock_transcription
        
        # Verify that categorize_text was called with correct args
        mock_categorize.assert_called_once_with(mock_transcription)
        
        # Verify no categorized entries were created
        assert len(result.categorized_entries) == 0

@pytest.mark.asyncio
async def test_process_audio_with_malformed_json(test_user, test_db):
    # Mock data
    mock_transcription = "Test transcription"
    mock_response = MagicMock()
    mock_response.text = mock_transcription

    # Mock categorize_text to return malformed JSON
    mock_categorize = AsyncMock()
    mock_categorize.return_value = "invalid json"

    with patch('app.services.audio.client.audio.transcriptions.create', return_value=mock_response), \
         patch('app.services.audio.categorize_text', new=mock_categorize):
        
        result = await process_audio(test_db, test_user.id, b"test audio")
        
        # Verify transcription was saved
        assert result.transcribed_text == mock_transcription
        # Verify no categorized entries were created
        assert len(result.categorized_entries) == 0

@pytest.mark.asyncio
async def test_process_audio_with_none_categories(test_user, test_db):
    # Mock data
    mock_transcription = "Test transcription"
    mock_response = MagicMock()
    mock_response.text = mock_transcription

    # Mock categorize_text to return None
    mock_categorize = AsyncMock()
    mock_categorize.return_value = None

    with patch('app.services.audio.client.audio.transcriptions.create', return_value=mock_response), \
         patch('app.services.audio.categorize_text', new=mock_categorize):
        
        result = await process_audio(test_db, test_user.id, b"test audio")
        
        # Verify transcription was saved
        assert result.transcribed_text == mock_transcription
        # Verify no categorized entries were created
        assert len(result.categorized_entries) == 0

@pytest.mark.asyncio
async def test_process_audio_with_empty_text(test_user, test_db):
    # Mock data
    mock_transcription = ""
    mock_response = MagicMock()
    mock_response.text = mock_transcription

    # Mock categorize_text
    mock_categorize = AsyncMock()
    mock_categorize.return_value = []

    with patch('app.services.audio.client.audio.transcriptions.create', return_value=mock_response), \
         patch('app.services.audio.categorize_text', new=mock_categorize):
        
        result = await process_audio(test_db, test_user.id, b"test audio")
        
        # Verify empty transcription was saved
        assert result.transcribed_text == ""
        # Verify no categorized entries were created
        assert len(result.categorized_entries) == 0
        # Verify categorize_text was not called
        mock_categorize.assert_not_called()
