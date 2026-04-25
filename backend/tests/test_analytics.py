"""
Tests for `app.services.analytics` — the PostHog wrapper.

The wrapper has three modes:
  - empty key → no-op stub, never imports posthog
  - key set + ENVIRONMENT=test → still no-op (CI must not emit events)
  - key set + ENVIRONMENT!=test → real client, capture forwards merged props
"""
from __future__ import annotations

import importlib
import sys
from unittest.mock import MagicMock

import pytest

import app.services.analytics as analytics_mod
import app.settings as settings_mod


@pytest.fixture(autouse=True)
def _reset_analytics_singleton():
    analytics_mod._reset_for_tests()
    yield
    analytics_mod._reset_for_tests()


def _reload_settings(monkeypatch, **env: str):
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    settings_mod.get_settings.cache_clear()
    importlib.reload(settings_mod)
    importlib.reload(analytics_mod)
    return analytics_mod


def test_empty_key_yields_noop_stub_and_never_imports_posthog(monkeypatch):
    mod = _reload_settings(
        monkeypatch, POSTHOG_API_KEY="", ENVIRONMENT="development"
    )
    # Make `import posthog` fail loudly if anyone tries.
    monkeypatch.setitem(sys.modules, "posthog", None)
    client = mod.get_client()
    assert isinstance(client, mod._NoopAnalytics)
    # Should not raise even though sys.modules['posthog'] = None would
    # break a real import.
    mod.capture_demo_event("demo_test", "session-id", {"k": "v"})


def test_test_environment_is_noop_even_with_key(monkeypatch):
    mod = _reload_settings(
        monkeypatch, POSTHOG_API_KEY="phc_real", ENVIRONMENT="test"
    )
    client = mod.get_client()
    assert isinstance(client, mod._NoopAnalytics)
    mod.capture_demo_event("demo_test", "session-id")


def test_real_client_lazy_inits_and_capture_merges_props(monkeypatch):
    mod = _reload_settings(
        monkeypatch, POSTHOG_API_KEY="phc_real", ENVIRONMENT="staging"
    )
    fake_capture = MagicMock()
    fake_posthog_class = MagicMock(return_value=MagicMock(capture=fake_capture))
    fake_posthog_module = MagicMock(Posthog=fake_posthog_class)
    monkeypatch.setitem(sys.modules, "posthog", fake_posthog_module)

    mod.capture_demo_event(
        "demo_submit",
        demo_session_id="sess-abc",
        properties={"outcome": "ok", "entry_id": "e-1"},
    )

    fake_posthog_class.assert_called_once()
    fake_capture.assert_called_once()
    args = fake_capture.call_args.args
    kwargs = fake_capture.call_args.kwargs
    assert args == ("demo_submit",)
    assert kwargs["distinct_id"] == "sess-abc"
    props = kwargs["properties"]
    # merged props include environment + demo_session_id
    assert props["environment"] == "staging"
    assert props["demo_session_id"] == "sess-abc"
    assert props["outcome"] == "ok"
    assert props["entry_id"] == "e-1"


def test_anon_distinct_id_when_session_missing(monkeypatch):
    mod = _reload_settings(
        monkeypatch, POSTHOG_API_KEY="phc_real", ENVIRONMENT="staging"
    )
    fake_capture = MagicMock()
    fake_posthog_class = MagicMock(return_value=MagicMock(capture=fake_capture))
    monkeypatch.setitem(sys.modules, "posthog", MagicMock(Posthog=fake_posthog_class))

    mod.capture_demo_event("demo_test", demo_session_id=None)
    distinct_id = fake_capture.call_args.kwargs["distinct_id"]
    assert distinct_id.startswith("anon-")
    # The anon UUID is fresh per call — call again, should differ.
    fake_capture.reset_mock()
    mod.capture_demo_event("demo_test_2", demo_session_id=None)
    second = fake_capture.call_args.kwargs["distinct_id"]
    assert second != distinct_id


def test_real_client_failure_falls_back_to_noop(monkeypatch):
    """If the posthog package raises during init we must not crash."""
    mod = _reload_settings(
        monkeypatch, POSTHOG_API_KEY="phc_real", ENVIRONMENT="staging"
    )

    def boom(**_kwargs):
        raise RuntimeError("posthog ctor exploded")

    monkeypatch.setitem(sys.modules, "posthog", MagicMock(Posthog=boom))
    client = mod.get_client()
    assert isinstance(client, mod._NoopAnalytics)
    # And capture still doesn't raise.
    mod.capture_demo_event("demo_test", "session-id")
