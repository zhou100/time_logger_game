"""
Models package.
Import all models here so Alembic autogenerate can discover them.
"""
from .base import Base
from .user import User
from .audio import Audio
from .categories import CategorizedEntry, ContentCategory, CustomCategory

# New v2 models
from .entry import Entry
from .classification import EntryClassification
from .entry_metadata import EntryMetadata
from .jobs import Job, JobStatus
from .refresh_token import RefreshToken
from .gamification import UserEvent, UserStats

__all__ = [
    "Base",
    "User",
    # Legacy
    "Audio",
    "CategorizedEntry",
    "ContentCategory",
    "CustomCategory",
    # New
    "Entry",
    "EntryClassification",
    "EntryMetadata",
    "Job",
    "JobStatus",
    "RefreshToken",
    "UserEvent",
    "UserStats",
]
