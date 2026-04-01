"""add local_date to entries

Revision ID: a1b2c3d4e5f6
Revises: f5a6b7c8d9e0
Create Date: 2026-04-01 23:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("entries", sa.Column("local_date", sa.Date(), nullable=True))
    # Backfill existing rows: extract date from recorded_at (or created_at as fallback)
    op.execute(
        "UPDATE entries SET local_date = COALESCE(DATE(recorded_at), DATE(created_at))"
    )


def downgrade() -> None:
    op.drop_column("entries", "local_date")
