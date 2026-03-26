import pytest
from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, patch, MagicMock
from .conftest import test_user, async_client, auth_async_client, test_db
from app.models import Audio
from app.services.audio import process_audio, transcribe_audio, save_audio
import os
from httpx import AsyncClient
from app.models.user import User
from app.models.audio import Audio

pytestmark = pytest.mark.asyncio

@pytest.mark.asyncio
async def test_transcribe_audio():
    """Test audio transcription with mocked OpenAI API"""
    # Mock OpenAI API response
    mock_response = {"text": "Test transcription"}
    
    with patch('openai.Audio.atranscribe', new_callable=AsyncMock) as mock_transcribe:
        mock_transcribe.return_value = mock_response
        
        # Create test file
        test_file_path = "test.mp3"
        with open(test_file_path, "wb") as f:
            f.write(b"test audio content")
        
        try:
            # Test transcription
            result = await transcribe_audio(test_file_path)
            assert result == "Test transcription"
            mock_transcribe.assert_called_once()
        finally:
            # Cleanup
            if os.path.exists(test_file_path):
                os.remove(test_file_path)

@pytest.mark.asyncio
async def test_save_audio(test_db: AsyncSession):
    """Test saving audio to database"""
    # Create test data
    transcribed_text = "Test transcription"
    filename = "test.mp3"
    content_type = "audio/mpeg"
    file_path = "/tmp/test.mp3"
    user_id = 1
    
    async with test_db as session:
        # Create audio entry
        audio = Audio(
            transcribed_text=transcribed_text,
            filename=filename,
            content_type=content_type,
            file_path=file_path,
            user_id=user_id
        )
        session.add(audio)
        await session.commit()
        await session.refresh(audio)
        
        # Verify saved data
        assert audio.id is not None
        assert audio.transcribed_text == transcribed_text
        assert audio.filename == filename
        assert audio.content_type == content_type
        assert audio.file_path == file_path

@pytest.mark.asyncio
async def test_process_audio_endpoint_integration(auth_async_client: AsyncClient, test_user: User):
    """Test the complete audio upload and processing flow"""
    # Create test audio file
    test_file = {
        "file": ("test.mp3", b"test audio data", "audio/mpeg")
    }
    
    # Mock OpenAI API call
    mock_response = {"text": "Test transcription"}
    
    with patch('openai.Audio.atranscribe', new_callable=AsyncMock) as mock_transcribe:
        mock_transcribe.return_value = mock_response
        
        # Upload and process audio
        response = await auth_async_client.post(
            "/api/audio/upload",
            files=test_file
        )
        
        # Check response
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "id" in data
        assert "transcribed_text" in data
        assert data["transcribed_text"] == "Test transcription"

@pytest.mark.asyncio
async def test_process_audio_endpoint_invalid_format(auth_async_client: AsyncClient, test_user: User):
    """Test uploading invalid file format"""
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
    assert "File must be an audio file" in data["detail"]

@pytest.mark.asyncio
async def test_process_audio_endpoint_transcription_error(auth_async_client: AsyncClient, test_user: User):
    """Test handling of transcription errors"""
    # Create test file
    test_file = {
        "file": ("test.mp3", b"test audio content", "audio/mpeg")
    }
    
    # Mock transcription error
    with patch('openai.Audio.atranscribe', new_callable=AsyncMock) as mock_transcribe:
        mock_transcribe.side_effect = Exception("Transcription failed")
        
        # Send request
        response = await auth_async_client.post(
            "/api/audio/upload",
            files=test_file
        )

        # Check response
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        data = response.json()
        assert "Transcription failed" in data["detail"]

@pytest.mark.asyncio
async def test_get_audio_entries(auth_async_client: AsyncClient, test_user: User, test_db: AsyncSession):
    """Test retrieving paginated audio entries"""
    # Create test entries
    async with test_db as session:
        entries = []
        for i in range(3):
            audio = Audio(
                transcribed_text=f"Test transcription {i}",
                filename="test.mp3",
                content_type="audio/mpeg",
                file_path="/tmp/test.mp3",
                user_id=test_user.id
            )
            session.add(audio)
            await session.commit()
            entries.append(audio)
    
    # Test pagination
    response = await auth_async_client.get("/api/audio?skip=0&limit=2")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data["entries"]) == 2
    
    # Test skip
    response = await auth_async_client.get("/api/audio?skip=2&limit=2")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data["entries"]) == 1

@pytest.mark.asyncio
async def test_get_audio_entry(auth_async_client: AsyncClient, test_user: User, test_db: AsyncSession):
    """Test retrieving a specific audio entry"""
    # Create test entry
    async with test_db as session:
        audio = Audio(
            transcribed_text="Test transcription",
            filename="test.mp3",
            content_type="audio/mpeg",
            file_path="/tmp/test.mp3",
            user_id=test_user.id
        )
        session.add(audio)
        await session.commit()
        await session.refresh(audio)
    
    # Test retrieval
    response = await auth_async_client.get(f"/api/audio/{audio.id}")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == audio.id
    assert data["transcribed_text"] == "Test transcription"
    
    # Test non-existent entry
    response = await auth_async_client.get("/api/audio/99999")
    assert response.status_code == status.HTTP_404_NOT_FOUND

@pytest.mark.asyncio
async def test_get_audio_entry_unauthorized(async_client: AsyncClient):
    """Test unauthorized access to audio entry"""
    response = await async_client.get("/api/audio/1")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
