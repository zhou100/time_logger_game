"""
Text categorization service using OpenAI GPT API.
"""
import os
import logging
from typing import List, Dict
from enum import Enum
from openai import OpenAI
from dotenv import load_dotenv
import json

# Configure logging
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

class CategoryType(Enum):
    TODO = "TODO"
    IDEA = "IDEA"
    THOUGHT = "THOUGHT"
    TIME_RECORD = "TIME_RECORD"

class CategorizationService:
    def __init__(self):
        """Initialize the OpenAI client with API key from environment."""
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.error("OPENAI_API_KEY environment variable is not set")
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        logger.info("OpenAI API key loaded successfully")
        self.client = OpenAI(api_key=api_key)

    def categorize_text(self, text: str) -> List[Dict[str, str]]:
        """
        Analyze text and extract categorized content using GPT.
        
        Args:
            text: Input text to analyze
            
        Returns:
            List[Dict[str, str]]: List of categories and their extracted content
        """
        try:
            logger.info(f"Starting text categorization for text of length {len(text)} characters")
            logger.debug(f"Input text: {text}")
            
            # Create the system prompt for categorization
            system_prompt = """
            Analyze the text and extract content into the following categories:
            - TODO: Action items or tasks
            - IDEA: New ideas or suggestions
            - THOUGHT: General thoughts or observations
            - TIME_RECORD: Time-related information or duration mentions
            
            Format the response as a JSON array with objects containing 'category' and 'extracted_content'.
            Only include categories that have relevant content.
            """
            
            logger.debug("Calling GPT API with system prompt and user text")
            # Call GPT API for categorization
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",  # Using the specified model
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text}
                ],
                response_format={"type": "json_object"}
            )
            
            # Parse the response
            response_content = response.choices[0].message.content
            logger.debug(f"Raw API response content: {response_content}")
            
            result = json.loads(response_content)
            categories = result.get("categories", [])
            
            logger.info(f"Text categorization completed successfully. Found {len(categories)} categories")
            logger.debug(f"Extracted categories: {categories}")
            
            return categories
            
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing JSON response: {str(e)}", exc_info=True)
            logger.error(f"Invalid JSON content: {response_content}")
            raise Exception(f"Failed to parse API response: {str(e)}")
        except Exception as e:
            logger.error(f"Error during categorization: {str(e)}", exc_info=True)
            raise Exception(f"Failed to categorize text: {str(e)}")

# Create a singleton instance
categorization_service = CategorizationService()
