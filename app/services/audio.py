import openai
from fastapi import UploadFile, HTTPException, status
import tempfile
import os
import json
from ..config import settings
from typing import Dict, Any

if not settings.OPENAI_API_KEY:
    print("Warning: OPENAI_API_KEY not set. Using mock responses for development.")

async def transcribe_audio(audio: UploadFile) -> str:
    """
    Transcribe audio file using OpenAI's Whisper API or return mock response for development
    """
    if not settings.OPENAI_API_KEY:
        return "I want to start working on my math homework for about 2 hours. This is for my calculus class."
        
    openai.api_key = settings.OPENAI_API_KEY
    
    # Save the uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as temp_file:
        content = await audio.read()
        temp_file.write(content)
        temp_file.flush()
        
        try:
            # Transcribe using OpenAI's Whisper
            with open(temp_file.name, "rb") as audio_file:
                transcript = openai.Audio.transcribe("whisper-1", audio_file)
            return transcript.text
        finally:
            # Clean up the temporary file
            try:
                os.unlink(temp_file.name)
            except Exception as e:
                print(f"Warning: Could not delete temporary file {temp_file.name}: {str(e)}")

async def classify_task(text: str) -> Dict[str, Any]:
    """
    Classify the transcribed text to determine task category and action
    """
    if not settings.OPENAI_API_KEY:
        # Mock response for development
        return {
            "action": "start",
            "category": "study",
            "description": "Math homework - Calculus class"
        }
        
    openai.api_key = settings.OPENAI_API_KEY
    
    # Prepare the prompt for GPT
    prompt = f"""Analyze the following text and classify it as either starting or ending a task.
    If starting a task, determine the category from these options: {', '.join(settings.TASK_CATEGORIES)}
    
    Text: {text}
    
    Respond in JSON format with the following structure:
    For starting: {{"action": "start", "category": "category_name", "description": "task description"}}
    For ending: {{"action": "end"}}
    """
    
    try:
        # Call GPT for classification
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a task classification assistant."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
        )
        
        # Parse the response
        result = json.loads(response.choices[0].message.content)
        
        # Validate category if action is "start"
        if result.get("action") == "start" and result.get("category") not in settings.TASK_CATEGORIES:
            raise ValueError(f"Invalid category. Must be one of: {', '.join(settings.TASK_CATEGORIES)}")
            
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error classifying task: {str(e)}"
        )
