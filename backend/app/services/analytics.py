"""
PostHog analytics — server-side product event capture.

Lazy-init pattern: a real PostHog client is constructed only when
`_settings_module.settings.POSTHOG_API_KEY` is non-empty AND `_settings_module.settings.ENVIRONMENT != "test"`.
Otherwise we hand callers a no-op stub with the same `capture(...)` method
shape so call sites never need to null-check.

`capture_demo_event(...)` is the only call site convention used by the
public-demo pipeline. It pins the merged-property contract (always stamps
`environment` + `demo_session_id`) and handles the anonymous fallback when
the session_id isn't known yet.

Never log or pass raw IPs, raw transcripts, or audio bytes through this
module. Hashed IPs are fine; full text is not.
"""
from __future__ import annotations

import logging
import threading
from typing import Any, Dict, Optional
from uuid import uuid4

from .. import settings as _settings_module

logger = logging.getLogger(__name__)


class _NoopAnalytics:
    """
    Drop-in stub matching the PostHog client surface we use.

    PostHog 3.x took `(distinct_id, event, properties)` as positional args.
    PostHog 7.x took the same names but moved distinct_id into the kwargs
    bag. Our wrapper always invokes `capture(event, distinct_id=..., properties=...)`
    so this stub uses the same shape.
    """

    def capture(
        self,
        event: str,
        *,
        distinct_id: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
        **_kwargs: Any,
    ) -> None:  # pragma: no cover — trivial
        return None


_client: Optional[object] = None
_init_lock = threading.Lock()


def _is_enabled() -> bool:
    """PostHog is on when we have a key and aren't running tests."""
    if _settings_module.settings.ENVIRONMENT == "test":
        return False
    return bool(_settings_module.settings.POSTHOG_API_KEY)


def get_client() -> Any:
    """
    Return the singleton client (real or no-op). Constructed on first call.

    The real PostHog client (`posthog` package) is imported lazily so that
    test environments don't pull the dependency at all when the key is
    empty — anyone running unit tests on a slim virtualenv shouldn't have
    to install posthog just to pass.
    """
    global _client
    if _client is not None:
        return _client
    with _init_lock:
        if _client is not None:
            return _client
        if not _is_enabled():
            _client = _NoopAnalytics()
            return _client
        try:
            from posthog import Posthog  # noqa: WPS433 — intentional lazy import

            _client = Posthog(
                project_api_key=_settings_module.settings.POSTHOG_API_KEY,
                host=getattr(
                    _settings_module.settings, "POSTHOG_HOST", None
                ) or "https://us.i.posthog.com",
            )
            logger.info("PostHog analytics initialized")
        except Exception as exc:  # noqa: BLE001 — never break the request path
            logger.warning(f"PostHog init failed; falling back to no-op: {exc}")
            _client = _NoopAnalytics()
        return _client


def _reset_for_tests() -> None:
    """Test-only: clear the cached singleton so env changes take effect."""
    global _client
    with _init_lock:
        _client = None


def capture_demo_event(
    event: str,
    demo_session_id: Optional[str],
    properties: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Server-side capture for anonymous-demo events.

    Distinct-id rule:
      - Use `demo_session_id` when present (so client + server events join
        on the same key without the server ever needing to read the
        HttpOnly cookie).
      - Otherwise mint a one-shot `anon-<uuid4>` so the event still lands
        somewhere addressable.

    Always merges in `environment` + `demo_session_id` for downstream
    filtering. Caller-supplied properties win on key collisions.
    """
    distinct_id = demo_session_id or f"anon-{uuid4()}"
    merged: Dict[str, Any] = {
        "environment": _settings_module.settings.ENVIRONMENT,
        "demo_session_id": demo_session_id,
    }
    if properties:
        merged.update(properties)

    try:
        # PostHog 7.x signature: capture(event, *, distinct_id=..., properties=...).
        # The no-op stub mirrors this. Kwargs-only on distinct_id is the
        # robust call shape.
        get_client().capture(event, distinct_id=distinct_id, properties=merged)
    except Exception as exc:  # noqa: BLE001 — analytics must never raise
        logger.debug(f"Analytics capture failed for {event}: {exc}")
