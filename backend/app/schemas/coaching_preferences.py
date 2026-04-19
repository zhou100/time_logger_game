"""
Coaching preferences — per-user personalization for the weekly audit prompt.

Storage: `users.coaching_preferences` JSONB column. NULL = use defaults.
Versioning: every stored payload includes `_version` for forward compat.
Read path: `normalize_stored_prefs()` is forgiving (unknown enums → defaults
for that field, extra keys dropped, malformed shape → full defaults). Write
path uses the strict Pydantic model with NFKC + zero-width + injection-phrase
filtering.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

logger = logging.getLogger(__name__)

PREFS_VERSION = 1

# Block prompt-injection-shaped strings, structural chars, and common
# English + Chinese override phrases. Applies to user-provided strings only
# (avoid_topics items).
_ZERO_WIDTH = re.compile(r"[\u200B-\u200F\uFEFF\u2060-\u206F]")
_FORBIDDEN_RE = re.compile(
    r"(<|>|\{|\}|`|\[|\]|"
    r"ignore previous|you are now|system:|assistant:|user:|"
    r"忽略(以上|之前|前面)|你现在是|不要遵守|系统提示|"
    r"</?\w+>)",
    re.IGNORECASE,
)

Tone = Literal["warm", "direct", "playful"]
Pacing = Literal["actionable", "reflective", "both"]
LanguageLock = Literal["auto", "zh", "en"]

DEFAULT_TONE: Tone = "warm"
DEFAULT_PACING: Pacing = "actionable"
DEFAULT_LANGUAGE_LOCK: LanguageLock = "auto"

_VALID_TONES = {"warm", "direct", "playful"}
_VALID_PACINGS = {"actionable", "reflective", "both"}
_VALID_LANG_LOCKS = {"auto", "zh", "en"}


def _clean_avoid_topic(item: Any) -> Optional[str]:
    """Normalize + reject a single avoid_topic. Returns None if it should be dropped."""
    if not isinstance(item, str):
        return None
    s = unicodedata.normalize("NFKC", item)
    s = _ZERO_WIDTH.sub("", s).strip()
    if not s:
        return None
    if len(s) > 60:
        raise ValueError("avoid_topic too long (max 60 chars)")
    if _FORBIDDEN_RE.search(s):
        raise ValueError("avoid_topic contains forbidden content")
    return s


class CoachingPreferences(BaseModel):
    """Strict write-side schema. PATCH bodies validate against this."""

    model_config = ConfigDict(extra="ignore")

    tone: Tone = DEFAULT_TONE
    pacing: Pacing = DEFAULT_PACING
    language_lock: LanguageLock = DEFAULT_LANGUAGE_LOCK
    avoid_topics: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("avoid_topics")
    @classmethod
    def _validate_avoid_topics(cls, v: list[str]) -> list[str]:
        cleaned: list[str] = []
        for item in v:
            normalized = _clean_avoid_topic(item)
            if normalized is not None:
                cleaned.append(normalized)
        return cleaned


def default_prefs_dict() -> dict:
    """Defaults as a plain dict (used for NULL column reads)."""
    return {
        "_version": PREFS_VERSION,
        "tone": DEFAULT_TONE,
        "pacing": DEFAULT_PACING,
        "language_lock": DEFAULT_LANGUAGE_LOCK,
        "avoid_topics": [],
    }


def normalize_stored_prefs(raw: Any) -> dict:
    """Forgiving read normalizer.

    Unknown enum values for any field → that field defaults. Unknown extra keys
    are dropped silently. Malformed top-level shape → full defaults + error log.
    """
    if not isinstance(raw, dict):
        if raw is not None:
            logger.error("coaching_preferences malformed (not a dict); using defaults")
        return default_prefs_dict()

    out = default_prefs_dict()

    tone = raw.get("tone")
    if isinstance(tone, str) and tone in _VALID_TONES:
        out["tone"] = tone
    elif tone is not None:
        logger.warning(f"coaching_preferences: unknown tone={tone!r}; using default")

    pacing = raw.get("pacing")
    if isinstance(pacing, str) and pacing in _VALID_PACINGS:
        out["pacing"] = pacing
    elif pacing is not None:
        logger.warning(f"coaching_preferences: unknown pacing={pacing!r}; using default")

    lang = raw.get("language_lock")
    if isinstance(lang, str) and lang in _VALID_LANG_LOCKS:
        out["language_lock"] = lang
    elif lang is not None:
        logger.warning(f"coaching_preferences: unknown language_lock={lang!r}; using default")

    topics = raw.get("avoid_topics")
    if isinstance(topics, list):
        cleaned: list[str] = []
        for item in topics[:10]:
            try:
                normalized = _clean_avoid_topic(item)
            except ValueError:
                continue
            if normalized is not None:
                cleaned.append(normalized)
        out["avoid_topics"] = cleaned
    elif topics is not None:
        logger.warning("coaching_preferences: avoid_topics not a list; using default")

    return out


def merge_patch(stored: dict, patch: dict) -> dict:
    """Apply a PATCH body to a stored dict.

    - Provided field overrides stored value
    - Missing field keeps stored value
    - Explicit `null` resets that field to default
    - `avoid_topics` is replace-not-append
    """
    defaults = default_prefs_dict()
    merged = dict(stored)
    for key in ("tone", "pacing", "language_lock", "avoid_topics"):
        if key not in patch:
            continue
        value = patch[key]
        if value is None:
            merged[key] = defaults[key]
        else:
            merged[key] = value
    merged["_version"] = PREFS_VERSION
    return merged


class CoachingPreferencesPatch(BaseModel):
    """Patch body — every field optional, explicit null allowed to reset."""

    model_config = ConfigDict(extra="ignore")

    tone: Optional[Tone] = None
    pacing: Optional[Pacing] = None
    language_lock: Optional[LanguageLock] = None
    avoid_topics: Optional[list[str]] = Field(default=None, max_length=10)

    @field_validator("avoid_topics")
    @classmethod
    def _validate_avoid_topics(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return None
        cleaned: list[str] = []
        for item in v:
            normalized = _clean_avoid_topic(item)
            if normalized is not None:
                cleaned.append(normalized)
        return cleaned
