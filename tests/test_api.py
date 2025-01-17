from fastapi import status
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from io import BytesIO
from app.services.auth import create_access_token
from app.models import ContentCategory

@pytest.fixture
def test_audio_file():
    file_content = b"test audio content"
    mock_file = MagicMock()
    mock_file.filename = "test.mp3"
    mock_file.content_type = "audio/mpeg"
    mock_file.headers = {"content-type": "audio/mpeg"}
    mock_file.read = AsyncMock(return_value=file_content)
    return mock_file

@pytest.fixture
def test_token(test_user):
    return create_access_token({"sub": test_user.email})

@pytest.fixture
def test_auth_headers(test_token):
    return {"Authorization": f"Bearer {test_token}"}

def test_process_audio_unauthorized(client):
    response = client.post("/api/audio/process")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

def test_process_audio_no_file(client, test_auth_headers):
    response = client.post("/api/audio/process", headers=test_auth_headers)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

def test_process_audio_success(client, test_auth_headers, test_audio_file):
    with patch("app.services.audio.transcribe_audio", new_callable=AsyncMock) as mock_transcribe, \
         patch("app.services.categorization.categorize_text", new_callable=AsyncMock) as mock_categorize:
        
        mock_transcribe.return_value = "Test transcription"
        mock_categorize.return_value = [
            {"category": "TODO", "content": "test todo"},
            {"category": "THOUGHT", "content": "test thought"}
        ]
        
        # Create multipart form data
        files = {"audio": test_audio_file}
        
        response = client.post(
            "/api/audio/process",
            files=files,
            headers=test_auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["transcribed_text"] == "Test transcription"
        assert len(data["categorized_entries"]) == 2

def test_get_entries_by_category_unauthorized(client):
    response = client.get("/api/categories/TODO")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

def test_get_entries_by_category(client, test_db, test_user, test_auth_headers, test_audio_file):
    # Create some test entries
    with patch("app.services.audio.transcribe_audio", new_callable=AsyncMock) as mock_transcribe, \
         patch("app.services.categorization.categorize_text", new_callable=AsyncMock) as mock_categorize:
        
        mock_transcribe.return_value = "Test transcription"
        mock_categorize.return_value = [
            {"category": "TODO", "content": "test todo"},
            {"category": "THOUGHT", "content": "test thought"}
        ]
        
        # Create a chat history entry with categorized entries
        files = {"audio": test_audio_file}
        
        response = client.post(
            "/api/audio/process",
            files=files,
            headers=test_auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        
        # Get entries for TODO category
        response = client.get(f"/api/categories/{ContentCategory.TODO.value}", headers=test_auth_headers)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["category"] == "TODO"
        assert data[0]["extracted_content"] == "test todo"

def test_get_all_entries(client, test_db, test_user, test_auth_headers, test_audio_file):
    # Create some test entries
    with patch("app.services.audio.transcribe_audio", new_callable=AsyncMock) as mock_transcribe, \
         patch("app.services.categorization.categorize_text", new_callable=AsyncMock) as mock_categorize:
        
        mock_transcribe.return_value = "Test transcription"
        mock_categorize.return_value = [
            {"category": "TODO", "content": "test todo"},
            {"category": "THOUGHT", "content": "test thought"}
        ]
        
        # Create a chat history entry with categorized entries
        files = {"audio": test_audio_file}
        
        response = client.post(
            "/api/audio/process",
            files=files,
            headers=test_auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        
        # Get all entries
        response = client.get("/api/categories", headers=test_auth_headers)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 2
        categories = {entry["category"] for entry in data}
        assert "TODO" in categories
        assert "THOUGHT" in categories
