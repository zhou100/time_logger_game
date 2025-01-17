from typing import List, Dict
from sqlalchemy.orm import Session
from ..models import ChatHistory, CategorizedEntry, ContentCategory
import openai
import json

async def categorize_text(text: str) -> List[Dict[str, str]]:
    """
    Use GPT-3.5-turbo to categorize text into different categories.
    Returns a list of dictionaries with category and extracted content.
    """
    prompt = f"""
    Analyze the following text and categorize relevant parts into these categories:
    - TODO: Tasks or things that need to be done
    - IDEA: New ideas or creative thoughts
    - THOUGHT: General thoughts or observations
    - TIME_RECORD: Time-related information or records
    
    For each category, extract only the relevant parts of the text.
    Format your response as a JSON array with objects containing 'category' and 'content'.
    Only include categories that have relevant content.
    
    Text to analyze: {text}
    """
    
    try:
        response = await openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that categorizes text into specific categories."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
        )
        
        # Parse the response to get categorized entries
        response_content = response.choices[0].message.content.strip()
        try:
            categorized_entries = json.loads(response_content)
            # Validate the response format
            if not isinstance(categorized_entries, list):
                return []
            
            valid_entries = []
            for entry in categorized_entries:
                if isinstance(entry, dict) and "category" in entry and "content" in entry:
                    # Ensure category is uppercase to match enum
                    entry["category"] = entry["category"].upper()
                    if entry["category"] in ContentCategory.__members__:
                        valid_entries.append(entry)
            return valid_entries
        except json.JSONDecodeError:
            print("Error decoding JSON response from OpenAI")
            return []
    except Exception as e:
        print(f"Error in categorization: {str(e)}")
        return []

async def save_chat_history(
    db: Session,
    user_id: int,
    transcribed_text: str,
    audio_path: str = None
) -> ChatHistory:
    """
    Save the transcribed text to chat history and create categorized entries.
    """
    # Create chat history entry
    chat_history = ChatHistory(
        user_id=user_id,
        transcribed_text=transcribed_text,
        audio_path=audio_path
    )
    db.add(chat_history)
    db.commit()
    db.refresh(chat_history)
    
    try:
        # Get categorized entries
        categorized_entries = await categorize_text(transcribed_text)
        
        # Create CategorizedEntry objects
        for entry in categorized_entries:
            db_entry = CategorizedEntry(
                chat_history_id=chat_history.id,
                category=ContentCategory[entry["category"]],
                extracted_content=entry["content"]
            )
            db.add(db_entry)
        
        db.commit()
        db.refresh(chat_history)
    except Exception as e:
        print(f"Error saving categorized entries: {str(e)}")
        # Don't fail the whole request if categorization fails
        pass
    
    return chat_history

async def get_category_entries(
    db: Session,
    user_id: int,
    category: ContentCategory = None
) -> List[CategorizedEntry]:
    """
    Get all entries for a specific category or all categories if none specified.
    """
    query = db.query(CategorizedEntry).join(ChatHistory).filter(ChatHistory.user_id == user_id)
    
    if category:
        query = query.filter(CategorizedEntry.category == category)
    
    return query.order_by(CategorizedEntry.created_at.desc()).all()
