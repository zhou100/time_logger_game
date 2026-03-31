"""
Text categorization using GPT-4o-mini.
Returns a list of {text, category} dicts — one entry can produce multiple classifications
from a single transcript (multi-entry extraction).
"""
import json
import logging
from typing import Any, Dict, List
from openai import AsyncOpenAI
from ..settings import settings

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


SYSTEM_PROMPT = """You are a time-logging assistant. Extract ALL distinct activities \
from the transcript and classify each into one of four life categories.

Categories:
- EARNING: work, meetings, deep work, admin, side projects, client calls, commute to work
- LEARNING: reading, courses, podcasts, research, studying, practice, skill-building
- RELAXING: exercise, hobbies, rest, entertainment, social outings, games, walks
- FAMILY: time with kids, partner, parents, family meals, family errands, caregiving

IMPORTANT rules:
- Extract MULTIPLE entries from a single transcript. A 90-second monologue typically \
contains 3-6 distinct items.
- Each entry gets its own object with the specific text for that activity.
- Do NOT invent activities. Only extract what is explicitly mentioned.
- Reference ONLY the activities listed in the transcript.
- Include "estimated_minutes" — your best guess at how many minutes this activity took. \
Use null if the user didn't mention a duration and you can't reasonably infer one. \
Only provide a number when the transcript explicitly states or strongly implies a duration.

Return valid JSON array only, with this shape:
[
  {"text": "specific activity or note text", "category": "EARNING|LEARNING|RELAXING|FAMILY", "estimated_minutes": <integer or null>},
  ...
]

Examples:

Input: "Had a 1-on-1 with my manager this morning."
Output: [{"text": "1-on-1 with manager", "category": "EARNING", "estimated_minutes": 30}]

Input: "This morning I worked on the dashboard for about 2 hours. Then read a chapter \
of that design book over lunch. Picked up the kids from school and took them to the park."
Output: [
  {"text": "Worked on the dashboard for about 2 hours", "category": "EARNING", "estimated_minutes": 120},
  {"text": "Read a chapter of a design book over lunch", "category": "LEARNING", "estimated_minutes": 30},
  {"text": "Picked up the kids from school and took them to the park", "category": "FAMILY", "estimated_minutes": 60}
]

Input: "Spent the whole day debugging a config issue. Hit the gym after work for an hour. \
Then watched a documentary about AI with my partner."
Output: [
  {"text": "Spent the day debugging a config issue", "category": "EARNING", "estimated_minutes": 480},
  {"text": "Gym session after work", "category": "RELAXING", "estimated_minutes": 60},
  {"text": "Watched a documentary about AI with partner", "category": "FAMILY", "estimated_minutes": 90}
]"""


async def categorize_text(text: str) -> List[Dict[str, Any]]:
    """
    Extract and classify all activities from transcript text using GPT-4o-mini.

    Returns a list of dicts: [{"text": str, "category": str}, ...]

    Fallback behaviour:
    - Empty transcript → raises ValueError("No speech detected")
    - Empty array from LLM → returns [{"text": full_transcript, "category": "EARNING"}]
    - Malformed/non-JSON response → returns [{"text": full_transcript, "category": "EARNING"}]
    """
    stripped = text.strip() if text else ""
    if not stripped:
        raise ValueError("No speech detected")

    try:
        response = await _get_client().chat.completions.create(
            model="gpt-5.4-nano",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": stripped},
            ],
            temperature=0.3,
        )
        raw = response.choices[0].message.content or ""
        results = json.loads(raw)

        # Validate: must be a non-empty list of dicts with text + category
        if not isinstance(results, list) or not results:
            raise ValueError("LLM returned empty or non-list result")

        _VALID_CATEGORIES = {"EARNING", "LEARNING", "RELAXING", "FAMILY"}
        valid = [
            r for r in results
            if isinstance(r, dict) and r.get("text") and r.get("category") in _VALID_CATEGORIES
        ]
        if not valid:
            raise ValueError("No valid entries in LLM result")

        logger.info(
            f"Categorized transcript ({len(stripped)} chars) → {len(valid)} entries: "
            f"{[r['category'] for r in valid]}"
        )
        return valid

    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        logger.warning(
            f"Categorization parse/validation failed ({exc}); falling back to EARNING"
        )
        return [{"text": stripped, "category": "EARNING"}]
    except Exception as exc:
        logger.error(f"Categorization API call failed: {exc}")
        return [{"text": stripped, "category": "EARNING"}]
