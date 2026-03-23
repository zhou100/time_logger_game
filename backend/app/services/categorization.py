"""
Text categorization using GPT-4o-mini.
Replaces the old service that used the deprecated openai.ChatCompletion.acreate() API.
"""
import json
import logging
from typing import Any, Dict
from openai import AsyncOpenAI
from ..settings import settings

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


SYSTEM_PROMPT = """You are a time-logging assistant. Analyze the input and classify it.

Categories:
- TODO: a task or action that needs to be done
- IDEA: a creative thought, suggestion, or concept
- THOUGHT: a general observation, reflection, or note
- TIME_RECORD: time tracking — what the user worked on and for how long

Return valid JSON only, with this shape:
{
  "category": "TODO|IDEA|THOUGHT|TIME_RECORD",
  "content": "cleaned-up version of the main content",
  "confidence": 0.0 to 1.0,
  "metadata": {
    "priority": "high|medium|low|null",
    "time_spent_minutes": null or integer,
    "tags": []
  }
}"""


async def categorize_text(text: str) -> Dict[str, Any]:
    """
    Classify text with GPT-4o-mini. Returns a dict with category, content,
    confidence, and metadata. On failure, returns a safe THOUGHT fallback.
    """
    try:
        response = await _get_client().chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        logger.info(f"Categorized '{text[:60]}...' → {result.get('category')}")
        return result
    except Exception as exc:
        logger.error(f"Categorization failed: {exc}")
        return {
            "category": "THOUGHT",
            "content": text,
            "confidence": 0.0,
            "metadata": {"priority": None, "time_spent_minutes": None, "tags": []},
        }
