import pytest
from fastapi import UploadFile
from unittest.mock import patch, MagicMock, AsyncMock
from app.services.audio import transcribe_audio, classify_task
from app.services.categorization import categorize_text, save_chat_history
from app.models import ContentCategory
import io
from types import SimpleNamespace

@pytest.fixture
def mock_audio_file():
    file_content = b"test audio content"
    file = io.BytesIO(file_content)
    upload_file = UploadFile(
        filename="test.mp3",
        file=file,
        headers={"content-type": "audio/mpeg"}
    )
    return upload_file

@pytest.mark.asyncio
async def test_transcribe_audio_mock(mock_audio_file):
    mock_response = SimpleNamespace(text="Test transcription")
    with patch("openai.audio.transcriptions.create", new_callable=AsyncMock) as mock_transcribe:
        mock_transcribe.return_value = mock_response
        result = await transcribe_audio(mock_audio_file)
        assert result == "Test transcription"

@pytest.mark.asyncio
async def test_classify_task_mock():
    test_text = "I want to start working on my physics homework"
    mock_response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content='{"action": "start", "category": "study", "description": "physics homework"}'
                )
            )
        ]
    )
    with patch("openai.chat.completions.create", new_callable=AsyncMock) as mock_completion:
        mock_completion.return_value = mock_response
        result = await classify_task(test_text)
        assert result["action"] == "start"
        assert result["category"] == "study"
        assert result["description"] == "physics homework"

@pytest.mark.asyncio
async def test_categorize_text_mock():
    test_text = "Remember to buy groceries. I had an idea for a new project."
    mock_response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content='[{"category": "TODO", "content": "buy groceries"}, {"category": "IDEA", "content": "new project"}]'
                )
            )
        ]
    )
    with patch("openai.chat.completions.create", new_callable=AsyncMock) as mock_completion:
        mock_completion.return_value = mock_response
        result = await categorize_text(test_text)
        assert len(result) == 2
        assert result[0]["category"] == "TODO"
        assert result[1]["category"] == "IDEA"

@pytest.mark.asyncio
async def test_save_chat_history(test_db, test_user):
    test_text = "Test transcription"
    with patch("app.services.categorization.categorize_text", new_callable=AsyncMock) as mock_categorize:
        mock_categorize.return_value = [
            {"category": "TODO", "content": "test todo"},
            {"category": "THOUGHT", "content": "test thought"}
        ]
        
        chat_history = await save_chat_history(
            db=test_db,
            user_id=test_user.id,
            transcribed_text=test_text
        )
        
        assert chat_history.transcribed_text == test_text
        assert chat_history.user_id == test_user.id
        assert len(chat_history.categorized_entries) == 2
        
        categories = [entry.category for entry in chat_history.categorized_entries]
        assert ContentCategory.TODO in categories
        assert ContentCategory.THOUGHT in categories
