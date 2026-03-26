"""
Audio transcription service using OpenAI Whisper API.
"""
import os
import logging
import tempfile
from typing import BinaryIO, Optional
from openai import OpenAI
from dotenv import load_dotenv, find_dotenv

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

class TranscriptionService:
    _instance: Optional['TranscriptionService'] = None
    
    def __new__(cls):
        if cls._instance is None:
            logger.debug("Initializing TranscriptionService singleton")
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        """Initialize the OpenAI client with API key from environment."""
        if self._initialized:
            return
            
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
            
        self._initialized = True

    async def test_api_key(self) -> bool:
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

    async def transcribe_audio(self, audio_content: bytes, language: str = "en") -> str:
        """
        Transcribe audio file using OpenAI Whisper API.
        
        Args:
            audio_content: Audio file content as bytes
            language: Language code for transcription (default: "en")
            
        Returns:
            str: Transcribed text
        """
        try:
            logger.info("Starting audio transcription")
            
            # Create a temporary file to store the audio content
            with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as temp_file:
                temp_file.write(audio_content)
                temp_file.flush()
                
                # Open the temporary file and transcribe
                with open(temp_file.name, 'rb') as audio_file:
                    response = self.client.audio.transcriptions.create(
                        file=audio_file,
                        model="whisper-1",
                        language=language
                    )
                    
                transcribed_text = response.text
                logger.info(f"Transcription successful: {transcribed_text}")
                
                # Clean up the temporary file
                os.unlink(temp_file.name)
                
                return transcribed_text
            
        except Exception as e:
            logger.error(f"Failed to transcribe audio: {str(e)}", exc_info=True)
            raise

# Create a singleton instance getter
def get_transcription_service() -> TranscriptionService:
    return TranscriptionService()
