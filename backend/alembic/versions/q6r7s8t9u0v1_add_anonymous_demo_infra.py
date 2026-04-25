"""add anonymous demo infrastructure — demo columns on entries/jobs, cost counter, request log

Supports the interaction-first landing anonymous-record → claim-on-signup flow.
Rather than introducing a separate `anonymous_demo_entries` table, we extend the
existing `entries` and `jobs` tables so the whole pipeline (worker, queue,
classifications) works unchanged for anonymous sessions.

Changes:
- entries.user_id → nullable; two new columns (demo_session_id, expires_at);
  partial indexes scoped to demo rows only to keep the hot authed path lean.
- jobs.user_id → nullable; add demo_session_id + partial index.
- demo_cost_counter: one row per UTC date tracking daily OpenAI spend with
  row-locked increments.
- demo_request_log: one row per /submit call retained 14 days for abuse audit.

The downgrade path fails loudly if any row still has NULL user_id; silently
dropping anonymous data is exactly the kind of thing downgrades should NOT do.

Revision ID: q6r7s8t9u0v1
Revises: p5q6r7s8t9u0
Create Date: 2026-04-24 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "q6r7s8t9u0v1"
down_revision: Union[str, None] = "p5q6r7s8t9u0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── entries: relax user_id + add demo columns ───────────────────────────
    op.alter_column("entries", "user_id", existing_type=sa.Integer(), nullable=True)
    op.add_column(
        "entries",
        sa.Column("demo_session_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "entries",
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Partial indexes: only include rows that participate in the anonymous flow.
    # The authed-user hot path pays zero write cost for these indexes.
    op.create_index(
        "ix_entries_demo_session_id",
        "entries",
        ["demo_session_id"],
        postgresql_where=sa.text("demo_session_id IS NOT NULL"),
    )
    op.create_index(
        "ix_entries_expires_at_demo",
        "entries",
        ["expires_at"],
        postgresql_where=sa.text("demo_session_id IS NOT NULL"),
    )

    # ── jobs: relax user_id + add demo column ───────────────────────────────
    op.alter_column("jobs", "user_id", existing_type=sa.Integer(), nullable=True)
    op.add_column(
        "jobs",
        sa.Column("demo_session_id", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_jobs_demo_session_id",
        "jobs",
        ["demo_session_id"],
        postgresql_where=sa.text("demo_session_id IS NOT NULL"),
    )

    # ── demo_cost_counter ───────────────────────────────────────────────────
    op.create_table(
        "demo_cost_counter",
        sa.Column("date", sa.Date(), primary_key=True),
        sa.Column(
            "cost_usd",
            sa.Numeric(10, 4),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # ── demo_request_log ────────────────────────────────────────────────────
    op.create_table(
        "demo_request_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("hashed_ip", sa.String(length=64), nullable=False),
        sa.Column("demo_session_id", sa.String(length=64), nullable=True),
        sa.Column("outcome", sa.String(length=32), nullable=False),
        sa.Column("whisper_ms", sa.Integer(), nullable=True),
        sa.Column("total_cost_usd", sa.Numeric(10, 4), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_demo_request_log_created_at",
        "demo_request_log",
        ["created_at"],
    )
    op.create_index(
        "ix_demo_request_log_demo_session_id",
        "demo_request_log",
        ["demo_session_id"],
    )


def downgrade() -> None:
    # Refuse to run if anonymous rows still exist — silent deletion would
    # corrupt the foreign-key graph for any user who had already claimed.
    connection = op.get_bind()
    null_entries = connection.execute(
        sa.text("SELECT COUNT(*) FROM entries WHERE user_id IS NULL")
    ).scalar_one()
    if null_entries:
        raise RuntimeError(
            f"Cannot downgrade: {null_entries} entries have NULL user_id. "
            "Delete or reassign them before downgrading."
        )
    null_jobs = connection.execute(
        sa.text("SELECT COUNT(*) FROM jobs WHERE user_id IS NULL")
    ).scalar_one()
    if null_jobs:
        raise RuntimeError(
            f"Cannot downgrade: {null_jobs} jobs have NULL user_id. "
            "Delete or reassign them before downgrading."
        )

    # demo_request_log
    op.drop_index("ix_demo_request_log_demo_session_id", table_name="demo_request_log")
    op.drop_index("ix_demo_request_log_created_at", table_name="demo_request_log")
    op.drop_table("demo_request_log")

    # demo_cost_counter
    op.drop_table("demo_cost_counter")

    # jobs
    op.drop_index("ix_jobs_demo_session_id", table_name="jobs")
    op.drop_column("jobs", "demo_session_id")
    op.alter_column("jobs", "user_id", existing_type=sa.Integer(), nullable=False)

    # entries
    op.drop_index("ix_entries_expires_at_demo", table_name="entries")
    op.drop_index("ix_entries_demo_session_id", table_name="entries")
    op.drop_column("entries", "expires_at")
    op.drop_column("entries", "demo_session_id")
    op.alter_column("entries", "user_id", existing_type=sa.Integer(), nullable=False)
