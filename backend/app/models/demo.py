"""
Anonymous demo flow bookkeeping tables.

DemoCostCounter  — one row per UTC date; tracks cumulative OpenAI cost for
                   the anonymous landing demo so the daily-cap check can short
                   circuit new /submit calls before they hit OpenAI.

DemoRequestLog   — one row per /v1/public/demo/submit call. Retained 14 days
                   for abuse investigation + cost attribution, then pruned
                   by the sweep job.
"""
from sqlalchemy import (
    BigInteger,
    Column,
    Date,
    DateTime,
    Index,
    Integer,
    Numeric,
    String,
    func,
)

from .base import Base


class DemoOutcome:
    """String constants for `DemoRequestLog.outcome` and metric/event labels.

    Kept as a plain class (not an Enum) so existing `String(32)` storage,
    Prometheus label values, and PostHog properties all use the same exact
    strings without `.value` lookups at every call site.
    """

    OK = "ok"
    CAPPED = "capped"
    RATE_LIMITED = "rate_limited"
    TURNSTILE_FAILED = "turnstile_failed"
    ERROR = "error"


DEMO_TEASER_METADATA_KEY = "demo_teaser"


class DemoCostCounter(Base):
    __tablename__ = "demo_cost_counter"

    date = Column(Date, primary_key=True)
    cost_usd = Column(Numeric(10, 4), nullable=False, server_default="0")
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class DemoRequestLog(Base):
    __tablename__ = "demo_request_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    hashed_ip = Column(String(64), nullable=False)
    demo_session_id = Column(String(64), nullable=True)
    # One of: ok | turnstile_failed | rate_limited | capped | error
    outcome = Column(String(32), nullable=False)
    whisper_ms = Column(Integer, nullable=True)
    total_cost_usd = Column(Numeric(10, 4), nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_demo_request_log_created_at", "created_at"),
        Index("ix_demo_request_log_demo_session_id", "demo_session_id"),
    )
