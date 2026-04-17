"""add resolved_at to entry_classifications

Adds a nullable resolved_at timestamp that is stamped when a capture's
status transitions out of "open" (done or dismissed). Backfills existing
non-open rows with classified_at as a best-guess fallback.

Revision ID: o4p5q6r7s8t9
Revises: n3o4p5q6r7s8
Create Date: 2026-04-16 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "o4p5q6r7s8t9"
down_revision: Union[str, None] = "n3o4p5q6r7s8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "entry_classifications",
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Backfill: for rows already closed, we don't know when it actually happened,
    # so fall back to classified_at. Better than null for histogram/filter queries.
    op.execute(
        """
        UPDATE entry_classifications
        SET resolved_at = classified_at
        WHERE status IN ('done', 'dismissed')
          AND resolved_at IS NULL
        """
    )
    op.create_index(
        "ix_classifications_resolved_at",
        "entry_classifications",
        ["resolved_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_classifications_resolved_at", table_name="entry_classifications")
    op.drop_column("entry_classifications", "resolved_at")
