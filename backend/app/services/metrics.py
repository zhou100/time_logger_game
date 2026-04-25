"""
Prometheus metrics for the anonymous-demo pipeline.

Metric definitions live here so call sites (`routes/public_demo.py`,
`services/worker.py`, `routes/v1/claim.py`, `services/demo_sweep.py`) can
import the named instruments and `.inc()` / `.set()` / `.observe()` them
inline. The `/metrics` endpoint in `main.py` is the only consumer of
`generate_latest()`.

We intentionally stick to the metric set listed in the design doc's
`## Observability` section so the dashboard wire-up later doesn't need a
chase-the-name pass. New metrics get added the same way: one line here, one
inc at the call site, one panel on the dashboard.
"""
from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

# ── Counters ──────────────────────────────────────────────────────────────────

demo_submit_total = Counter(
    "demo_submit_total",
    "Anonymous demo /submit calls grouped by terminal outcome.",
    ["outcome"],  # ok | capped | rate_limited | turnstile_failed | error
)

demo_rate_limited_total = Counter(
    "demo_rate_limited_total",
    "Demo requests blocked by a rate-limit bucket.",
    ["limiter"],  # per_ip_minute | per_session_hour | per_ip_day
)

demo_claims_total = Counter(
    "demo_claims_total",
    "Outcomes of POST /v1/entries/claim-demo-session.",
    ["result"],  # succeeded | missing | failed
)

demo_sweep_expired_total = Counter(
    "demo_sweep_expired_total",
    "Total expired demo entries deleted by the sweep job.",
)

demo_sweep_pruned_log_total = Counter(
    "demo_sweep_pruned_log_total",
    "Total demo_request_log rows pruned by the sweep job.",
)

# ── Gauges ────────────────────────────────────────────────────────────────────

demo_cost_usd_today = Gauge(
    "demo_cost_usd_today",
    "Aggregate OpenAI USD spend on demo traffic for the current UTC day.",
)

# ── Histograms ────────────────────────────────────────────────────────────────

demo_whisper_latency_seconds = Histogram(
    "demo_whisper_latency_seconds",
    "Wall-clock seconds spent in the Whisper transcription call for demo jobs.",
    buckets=(1, 2, 5, 10, 20, 30, 60),
)
