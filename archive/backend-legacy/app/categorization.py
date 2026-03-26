"""
Text categorization service using OpenAI GPT.
"""
import os
import logging
from typing import List, Dict, Optional
from enum import Enum
from openai import OpenAI
from dotenv import load_dotenv
import json
from unittest.mock import Mock, patch
import pytest

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

class CategoryType(Enum):
    TODO = "TODO"
    IDEA = "IDEA"
    THOUGHT = "THOUGHT"
    TIME_RECORD = "TIME_RECORD"

class CategorizationService:
    _instance: Optional['CategorizationService'] = None
    
    def __new__(cls):
        if cls._instance is None:
            logger.debug("Creating new CategorizationService instance")
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        """Initialize the OpenAI client with API key from environment."""
        if getattr(self, '_initialized', False):
            return
            
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.error("OPENAI_API_KEY environment variable is not set")
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        
        self.client = OpenAI(api_key=api_key)
        self._validate_api_key()
        self._initialized = True

    def _validate_api_key(self):
        """Validate the API key by listing models."""
        try:
            self.client.models.list()
            logger.info("OpenAI client initialized and API key validated successfully")
        except Exception as e:
            logger.error(f"Failed to validate API key: {str(e)}", exc_info=True)
            raise Exception("Failed to validate API key")

    def _get_system_prompt(self) -> str:
        """Get the system prompt for categorization."""
        return """You are a text categorization assistant. Your task is to analyze text and extract content into specific categories.
        
        The categories are:
        - TODO: Tasks, reminders, or things that need to be done
        - IDEA: Creative thoughts, suggestions, or potential solutions
        - THOUGHT: General observations, reflections, or opinions
        - TIME_RECORD: Time spent on activities or time-related information
        
        Return your analysis in JSON format with this structure:
        {
            "categories": [
                {
                    "category": "CATEGORY_NAME",
                    "content": "relevant text"
                }
            ]
        }
        
        Only include categories that are clearly present in the text. Ensure the content preserves the original meaning."""

    def _get_user_prompt(self, text: str) -> str:
        """Get the user prompt for categorization."""
        return f"""Please analyze this text and categorize any relevant content: {text}"""

    async def categorize_text(self, text: str) -> List[Dict[str, str]]:
        """
        Analyze text and extract categorized content using GPT.
        
        Args:
            text: Input text to analyze
            
        Returns:
            List[Dict[str, str]]: List of categories and their extracted content
        
        Raises:
            ValueError: If input text is empty or invalid
            JSONDecodeError: If API response cannot be parsed
            Exception: For other unexpected errors
        """
        if not text or not isinstance(text, str):
            logger.error("Invalid input text provided")
            raise ValueError("Input text must be a non-empty string")
        
        try:
            logger.info(f"Categorizing text: {text}")
            
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": self._get_system_prompt()},
                    {"role": "user", "content": self._get_user_prompt(text)}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            
            # Parse response
            try:
                if not response or not response.choices:
                    raise ValueError("Empty response from API")
                    
                content = response.choices[0].message.content
                if not content:
                    raise ValueError("Empty content in API response")
                    
                logger.debug(f"Raw API response content: {content}")
                
                try:
                    result = json.loads(content)
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse API response: {e}", exc_info=True)
                    raise json.JSONDecodeError(f"Failed to parse API response: {str(e)}", e.doc, e.pos)
                
                if not isinstance(result, dict):
                    raise ValueError("API response is not a JSON object")
                    
                categories = result.get("categories")
                if not isinstance(categories, list):
                    raise ValueError("Categories field is missing or not a list")
                    
                logger.info(f"Categorization successful. Found {len(categories)} categories.")
                return categories
                    
            except (KeyError, TypeError, AttributeError) as e:
                logger.error(f"Invalid response format: {str(e)}", exc_info=True)
                raise ValueError(f"Invalid response format: {str(e)}")
                
        except Exception as e:
            logger.error(f"Unexpected error during categorization: {str(e)}", exc_info=True)
            raise Exception(f"Failed to categorize text: {str(e)}")

# Create a singleton instance getter
def get_categorization_service() -> CategorizationService:
    return CategorizationService()

# Test function
@patch('__main__.OpenAI')
def test_categorize_text(mock_openai):
    # Mock the OpenAI client
    mock_client = Mock()
    mock_openai.return_value = mock_client

    # Mock the chat completions create method
    mock_response = Mock()
    mock_response.choices = [
        Mock(message=Mock(content='{"categories": [{"category": "TODO", "content": "Sample content"}]}'))
    ]
    mock_client.chat.completions.create.return_value = mock_response

    # Create an instance of CategorizationService
    service = CategorizationService()

    # Override the _validate_api_key method to avoid actual API calls during testing
    service._validate_api_key = Mock()

    # Call the method
    result = service.categorize_text("Sample text")

    # Assert the expected outcome
    assert result == [{"category": "TODO", "content": "Sample content"}]

    # Verify that the create method was called with the expected arguments
    mock_client.chat.completions.create.assert_called_once_with(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": service._get_system_prompt()},
            {"role": "user", "content": service._get_user_prompt("Sample text")}
        ],
        temperature=0.3,
        response_format={"type": "json_object"}
    )

if __name__ == "__main__":
    pytest.main([__file__])
