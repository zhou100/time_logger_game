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


SYSTEM_PROMPT = """You are a time-logging assistant. Extract ALL distinct activities, \
tasks, ideas, and notes from the transcript and return them as a JSON array.

Categories:
- TODO: a task or action item that needs to be done
- IDEA: a creative thought, suggestion, or concept
- THOUGHT: a general observation, reflection, or note
- TIME_RECORD: time tracking — what the user worked on and for how long

IMPORTANT rules:
- Extract MULTIPLE entries from a single transcript. A 90-second monologue typically \
contains 3-6 distinct items.
- Each entry gets its own object with the specific text for that activity.
- Do NOT invent activities. Only extract what is explicitly mentioned.
- Reference ONLY the activities listed in the transcript.

Return valid JSON array only, with this shape:
[
  {"text": "specific activity or note text", "category": "TODO|IDEA|THOUGHT|TIME_RECORD"},
  ...
]

Examples:

Input: "I need to fix the login bug tomorrow."
Output: [{"text": "Fix the login bug", "category": "TODO"}]

Input: "This morning I worked on the dashboard for about 2 hours. Then had three \
back-to-back meetings that felt unproductive. Had an idea to add voice replay to \
the audit feature. Still need to write tests for the auth module."
Output: [
  {"text": "Worked on the dashboard for about 2 hours", "category": "TIME_RECORD"},
  {"text": "Three back-to-back meetings that felt unproductive", "category": "TIME_RECORD"},
  {"text": "Add voice replay to the audit feature", "category": "IDEA"},
  {"text": "Write tests for the auth module", "category": "TODO"}
]

Input: "Spent the whole day debugging a config issue. Finally fixed it at 5pm. \
Realized we should document environment setup better. Also need to review the PR \
from Sarah before standup tomorrow."
Output: [
  {"text": "Spent the day debugging a config issue, fixed it at 5pm", "category": "TIME_RECORD"},
  {"text": "Document environment setup better", "category": "IDEA"},
  {"text": "Review PR from Sarah before standup tomorrow", "category": "TODO"}
]"""


async def categorize_text(text: str) -> List[Dict[str, Any]]:
    """
    Extract and classify all activities from transcript text using GPT-4o-mini.

    Returns a list of dicts: [{"text": str, "category": str}, ...]

    Fallback behaviour:
    - Empty transcript → raises ValueError("No speech detected")
    - Empty array from LLM → returns [{"text": full_transcript, "category": "THOUGHT"}]
    - Malformed/non-JSON response → returns [{"text": full_transcript, "category": "THOUGHT"}]
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

        valid = [
            r for r in results
            if isinstance(r, dict) and r.get("text") and r.get("category")
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
            f"Categorization parse/validation failed ({exc}); falling back to THOUGHT"
        )
        return [{"text": stripped, "category": "THOUGHT"}]
    except Exception as exc:
        logger.error(f"Categorization API call failed: {exc}")
        return [{"text": stripped, "category": "THOUGHT"}]
