"""add coaching_preferences to users

Adds a JSONB column for per-user coaching personalization (tone, pacing,
language_lock, avoid_topics) plus a stamp column used for cache-staleness
detection on weekly reports. NULL means defaults; no backfill needed.

Revision ID: p5q6r7s8t9u0
Revises: o4p5q6r7s8t9
Create Date: 2026-04-18 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "p5q6r7s8t9u0"
down_revision: Union[str, None] = "o4p5q6r7s8t9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("coaching_preferences", JSONB, nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("coaching_preferences_updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "coaching_preferences_updated_at")
    op.drop_column("users", "coaching_preferences")
