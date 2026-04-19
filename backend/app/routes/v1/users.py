"""
/api/v1/users — Per-user settings.

Currently exposes coaching preferences read/write. The preferences steer the
weekly audit prompt (tone, pacing, language lock, avoided topics).

PATCH semantics: partial body merges with stored value. Explicit `null` for a
field resets that field to default. `avoid_topics` is replace-not-append.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...db import get_db
from ...models.user import User
from ...schemas.coaching_preferences import (
    CoachingPreferences,
    CoachingPreferencesPatch,
    default_prefs_dict,
    merge_patch,
    normalize_stored_prefs,
)
from ...utils.auth import get_current_user

router = APIRouter(prefix="/users", tags=["users"])


@router.get(
    "/me/preferences",
    response_model=CoachingPreferences,
    summary="Get the current user's coaching preferences",
)
async def get_my_preferences(
    current_user: User = Depends(get_current_user),
):
    """Returns full default object when the column is NULL or malformed."""
    raw = current_user.coaching_preferences
    if raw is None:
        normalized = default_prefs_dict()
    else:
        normalized = normalize_stored_prefs(raw)
    return CoachingPreferences(
        tone=normalized["tone"],
        pacing=normalized["pacing"],
        language_lock=normalized["language_lock"],
        avoid_topics=normalized["avoid_topics"],
    )


@router.patch(
    "/me/preferences",
    response_model=CoachingPreferences,
    status_code=status.HTTP_200_OK,
    summary="Update coaching preferences (partial merge)",
)
async def update_my_preferences(
    body: CoachingPreferencesPatch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Partial PATCH semantics:
      - Field present in body → overrides stored value
      - Field absent          → keeps stored value
      - Field set to null     → resets to default
      - avoid_topics replaces the full list (not append)
    """
    stored = (
        normalize_stored_prefs(current_user.coaching_preferences)
        if current_user.coaching_preferences is not None
        else default_prefs_dict()
    )
    patch = body.model_dump(exclude_unset=True)
    merged = merge_patch(stored, patch)

    current_user.coaching_preferences = merged
    current_user.coaching_preferences_updated_at = datetime.now(timezone.utc)
    await db.commit()

    return CoachingPreferences(
        tone=merged["tone"],
        pacing=merged["pacing"],
        language_lock=merged["language_lock"],
        avoid_topics=merged["avoid_topics"],
    )
