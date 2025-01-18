import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from openai import AsyncOpenAI
import json
from ..models import ChatHistory, CategorizedEntry, ContentCategory
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Initialize OpenAI client
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

async def categorize_text(text: str) -> List[Dict[str, Any]]:
    """
    Categorize text using OpenAI's GPT API into predefined categories.
    
    Args:
        text: The text to categorize
        
    Returns:
        List of dictionaries containing category and content.
        Each dictionary has the format: {"category": str, "content": str}
        
    Raises:
        ValueError: If text is empty or too long
        HTTPException: If there's an error with the OpenAI API
    """
    if not text or not text.strip():
        logger.error("Empty text provided to categorize_text")
        return []
        
    if len(text) > 10000:  # OpenAI has a token limit
        logger.warning("Text too long for categorization, truncating...")
        text = text[:10000]
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4",
            messages=[
                {
                    "role": "system",
                    "content": """You are a task categorizer. Analyze the given text and break it down into EXACTLY these categories:
                                'todo' (tasks/actions), 'idea' (new ideas/suggestions), 
                                'thought' (general thoughts/observations), 'time_record' (time-related notes).
                                Return a JSON array where each item has 'category' and 'content' fields.
                                The category MUST be one of: 'todo', 'idea', 'thought', 'time_record' (exactly as written).
                                Example: [{"category": "todo", "content": "Buy groceries"},
                                        {"category": "idea", "content": "Start a blog"}]"""
                },
                {
                    "role": "user",
                    "content": f"Categorize this text: {text}"
                }
            ]
        )
        
        try:
            categories = json.loads(response.choices[0].message.content)
            logger.info(f"GPT categorization response: {categories}")
            
            if not isinstance(categories, list):
                logger.warning(f"Invalid GPT response format - expected list, got {type(categories)}")
                return []
            
            # Validate each category
            valid_categories = []
            valid_category_values = [cat.value for cat in ContentCategory]
            logger.info(f"Valid category values: {valid_category_values}")
            
            for item in categories:
                if not isinstance(item, dict):
                    logger.warning(f"Invalid category format - expected dict, got {type(item)}")
                    continue
                    
                if "category" not in item or "content" not in item:
                    logger.warning(f"Missing required fields in category: {item}")
                    continue
                    
                if not isinstance(item["category"], str) or not isinstance(item["content"], str):
                    logger.warning(f"Invalid field types in category: {item}")
                    continue
                    
                if item["category"] not in valid_category_values:
                    logger.warning(f"Invalid category value: {item['category']}, valid values are: {valid_category_values}")
                    continue
                    
                valid_categories.append(item)
                
            if not valid_categories and categories:
                logger.warning("No valid categories found in GPT response")
                
            return valid_categories
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse GPT response as JSON: {str(e)}")
            logger.debug(f"Raw response: {response.choices[0].message.content}")
            return []
            
    except Exception as e:
        logger.error(f"Error in categorize_text: {str(e)}")
        if isinstance(e, HTTPException):
            raise  # Re-raise HTTP exceptions
        raise HTTPException(
            status_code=500,
            detail=f"Error categorizing text: {str(e)}"
        )

async def save_chat_history(
    db: AsyncSession,
    user_id: int,
    transcribed_text: str,
    categories: List[Dict[str, Any]]
) -> ChatHistory:
    """
    Save chat history and categorized entries to database
    """
    try:
        now = datetime.now(timezone.utc)
        
        # Create chat history entry
        chat_history = ChatHistory(
            user_id=user_id,
            text=transcribed_text,
            created_at=now
        )
        db.add(chat_history)
        await db.flush()  # Flush to get the chat_history.id
        
        # Save categorized entries
        valid_entries = []
        for category in categories:
            try:
                content_category = ContentCategory(category["category"])
                
                categorized_entry = CategorizedEntry(
                    chat_history_id=chat_history.id,
                    user_id=user_id,
                    category=content_category,
                    content=category["content"],
                    created_at=now
                )
                valid_entries.append(categorized_entry)
            except (ValueError, KeyError):
                logger.warning(f"Invalid category {category.get('category', 'UNKNOWN')}, skipping")
                continue
        
        # Only add valid entries
        if valid_entries:
            db.add_all(valid_entries)
        
        await db.commit()
        await db.refresh(chat_history, ["categorized_entries"])
        
        return chat_history
        
    except Exception as e:
        logger.error(f"Error saving chat history: {str(e)}")
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Error saving chat history"
        )

async def get_entries_by_category(
    db: AsyncSession,
    user_id: int,
    category: str,
    page: int = 1,
    page_size: int = 10
) -> Dict[str, Any]:
    """
    Get entries filtered by category with pagination
    """
    try:
        # Calculate offset
        offset = (page - 1) * page_size

        # Try to convert category string to enum
        try:
            category_enum = ContentCategory(category)
        except ValueError:
            raise ValueError(f"Invalid category: {category}")

        # Build query
        query = select(CategorizedEntry).where(
            CategorizedEntry.user_id == user_id,
            CategorizedEntry.category == category_enum
        ).order_by(CategorizedEntry.created_at.desc())

        # Get total count
        total_query = select(CategorizedEntry).where(
            CategorizedEntry.user_id == user_id,
            CategorizedEntry.category == category_enum
        )
        result = await db.execute(total_query)
        total = len(result.unique().all())

        # Get paginated results
        result = await db.execute(query.offset(offset).limit(page_size))
        entries = result.unique().scalars().all()

        # Format results
        items = []
        for entry in entries:
            items.append({
                "id": entry.id,
                "content": entry.content,
                "category": entry.category.value,
                "created_at": entry.created_at.isoformat()
            })

        return {
            "items": items,
            "total": total
        }

    except Exception as e:
        logger.error(f"Error in get_entries_by_category: {str(e)}")
        raise e

async def get_entries_by_date_range(
    db: AsyncSession,
    user_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    page: int = 1,
    page_size: int = 10
) -> Dict[str, Any]:
    """
    Get entries filtered by date range with pagination
    """
    try:
        # Calculate offset
        offset = (page - 1) * page_size

        # Build base query
        query = select(ChatHistory).where(
            ChatHistory.user_id == user_id
        )

        # Add date filters if provided
        if start_date:
            query = query.where(ChatHistory.created_at >= datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc))
        if end_date:
            query = query.where(ChatHistory.created_at <= datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc))

        # Order by date
        query = query.order_by(ChatHistory.created_at.desc())

        # Get total count
        total_query = select(ChatHistory).where(
            ChatHistory.user_id == user_id
        )
        if start_date:
            total_query = total_query.where(ChatHistory.created_at >= datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc))
        if end_date:
            total_query = total_query.where(ChatHistory.created_at <= datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc))

        result = await db.execute(total_query)
        total = len(result.unique().all())

        # Get paginated results
        result = await db.execute(query.offset(offset).limit(page_size))
        entries = result.unique().scalars().all()

        # Format results
        items = []
        for entry in entries:
            categories = []
            for categorized_entry in entry.categorized_entries:
                categories.append(categorized_entry.category.value)

            items.append({
                "id": entry.id,
                "text": entry.text,
                "categories": categories,
                "created_at": entry.created_at.isoformat()
            })

        return {
            "items": items,
            "total": total
        }

    except Exception as e:
        logger.error(f"Error in get_entries_by_date_range: {str(e)}")
        raise e
