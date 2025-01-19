"""
Audio transcription service using OpenAI Whisper API.
"""
import os
import logging
from typing import BinaryIO
from openai import OpenAI
from dotenv import load_dotenv, find_dotenv

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

class TranscriptionService:
    def __init__(self):
        """Initialize the OpenAI client with API key from environment."""
        # Load environment variables with explicit path
        env_path = find_dotenv()
        logger.debug(f"Loading .env file from: {env_path}")
        load_dotenv(env_path)
        
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.error("OPENAI_API_KEY environment variable is not set")
            raise ValueError("OPENAI_API_KEY environment variable is not set")
            
        # Mask the API key for logging
        masked_key = f"{api_key[:8]}...{api_key[-4:]}" if len(api_key) > 12 else "***"
        logger.debug(f"OpenAI API key loaded successfully (masked: {masked_key})")
        
        try:
            self.client = OpenAI(api_key=api_key)
            logger.debug("OpenAI client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI client: {str(e)}", exc_info=True)
            raise

    def test_api_key(self) -> bool:
        """Test if the API key is valid by making a simple API call."""
        try:
            logger.debug("Testing OpenAI API key with models.list() call")
            # Try to list models as a simple API test
            models = self.client.models.list()
            logger.info("OpenAI API key test successful")
            return True
        except Exception as e:
            logger.error(f"OpenAI API key test failed: {str(e)}", exc_info=True)
            return False

    def transcribe_audio(self, audio_file: BinaryIO, language: str = "en") -> str:
        """
        Transcribe audio using OpenAI Whisper API.
        
        Args:
            audio_file: Audio file object
            language: Language code (default: "en" for English)
            
        Returns:
            str: Transcribed text
            
        Raises:
            Exception: If transcription fails
        """
        try:
            # Test API key first
            if not self.test_api_key():
                raise Exception("OpenAI API key validation failed")

            # Log file details
            file_pos = audio_file.tell()
            audio_file.seek(0, 2)  # Seek to end
            file_size = audio_file.tell()
            audio_file.seek(file_pos)  # Restore position
            logger.info(f"Starting audio transcription for file of size {file_size} bytes")
            
            # Create transcription using Whisper API
            logger.debug(f"Calling Whisper API with parameters: model=whisper-1, language={language}")
            response = self.client.audio.transcriptions.create(
                file=audio_file,
                model="whisper-1",
                language=language,
                response_format="text"
            )
            
            logger.info(f"Audio transcription completed successfully. Response length: {len(str(response))} characters")
            logger.debug(f"Transcribed text: {response}")
            return response
            
        except Exception as e:
            logger.error(f"Error during transcription: {str(e)}", exc_info=True)
            raise Exception(f"Failed to transcribe audio: {str(e)}")

# Create a singleton instance
logger.debug("Initializing TranscriptionService singleton")
transcription_service = TranscriptionService()

# Test API key on initialization
logger.debug("Testing API key after initialization")
transcription_service.test_api_key()
