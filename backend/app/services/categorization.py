"""
Text categorization service using GPT-4o-mini.
"""

import openai
from typing import Dict, Any, List
import json
import logging

# Configure logging
logger = logging.getLogger(__name__)

async def categorize_text(text: str) -> Dict[str, Any]:
    """
    Categorize text using GPT-4o-mini model.
    
    Args:
        text: The text to categorize
        
    Returns:
        Dict containing categorized information
    """
    try:
        logger.info(f"Categorizing text: {text[:100]}...")
        
        # System message defining the task
        system_message = """You are a text categorization assistant. Analyze the input text and categorize it into one of these types:
        - TODO: Tasks or actions to be done
        - IDEA: Creative thoughts or suggestions
        - THOUGHT: General observations or reflections
        - TIME_RECORD: Time tracking or scheduling information
        
        Extract relevant details and format as JSON with fields:
        {
            "category": "TODO|IDEA|THOUGHT|TIME_RECORD",
            "content": "Extracted main content",
            "metadata": {
                "priority": "high|medium|low" (for TODOs),
                "time_spent": "duration in minutes" (for TIME_RECORD),
                "tags": ["relevant", "tags"]
            }
        }"""

        # Call OpenAI API
        response = await openai.ChatCompletion.acreate(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": text}
            ],
            temperature=0.3
        )

        # Parse response
        result = json.loads(response.choices[0].message.content)
        logger.info(f"Categorization result: {result}")
        return result

    except Exception as e:
        logger.error(f"Error categorizing text: {str(e)}")
        raise
