import os
import json
import logging
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables from .env
load_dotenv(override=True)

logger = logging.getLogger(__name__)

def analyze_with_llm(prompt: str, context_file: str = None, model: str = "gpt-4o-mini"):
    """Analyze task using specified LLM model"""
    client = OpenAI()
    
    try:
        context = ""
        if context_file and Path(context_file).exists():
            context = Path(context_file).read_text()
            logger.info(f"Loaded context from {context_file}")
        
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system", 
                    "content": "You are an expert software architect. Return responses in valid JSON format."
                },
                {
                    "role": "user", 
                    "content": f"Context:\n{context}\n\nTask:\n{prompt}"
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.2
        )
        
        return json.loads(response.choices[0].message.content)
    
    except Exception as e:
        logger.error(f"LLM analysis failed: {str(e)}")
        raise
