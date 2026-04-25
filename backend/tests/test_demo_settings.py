"""
Tests for the new demo-related settings added in the anonymous-demo
infrastructure migration.
"""
from __future__ import annotations

import importlib

import pytest


def _fresh_settings(monkeypatch, **env):
    """Reload app.settings with the given env vars applied."""
    # Clear get_settings lru_cache so new env takes effect.
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    import app.settings as settings_mod
    settings_mod.get_settings.cache_clear()
    importlib.reload(settings_mod)
    return settings_mod.get_settings()


def test_defaults_load(monkeypatch):
    # Clear any env-file-influenced overrides by explicitly unsetting
    for k in [
        "PUBLIC_DEMO_ENABLED", "FLYWHEEL_ENABLED", "WELCOME_HANDOFF_ENABLED",
        "DAILY_DEMO_OPENAI_USD_CAP", "DEMO_IP_HASH_SALT", "DEMO_CLAIM_HMAC_SECRET",
        "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY",
        "POSTHOG_API_KEY", "SLACK_ALERT_WEBHOOK_URL",
    ]:
        monkeypatch.delenv(k, raising=False)

    s = _fresh_settings(monkeypatch)
    assert s.PUBLIC_DEMO_ENABLED is True
    assert s.FLYWHEEL_ENABLED is True
    assert s.WELCOME_HANDOFF_ENABLED is True
    assert s.DAILY_DEMO_OPENAI_USD_CAP == pytest.approx(5.00)
    assert s.DEMO_IP_HASH_SALT == "test-salt-do-not-use-in-prod"
    assert s.DEMO_CLAIM_HMAC_SECRET == "test-claim-hmac-secret-do-not-use-in-prod"
    assert s.TURNSTILE_SITE_KEY == ""
    assert s.TURNSTILE_SECRET_KEY == ""
    assert s.POSTHOG_API_KEY == ""
    assert s.SLACK_ALERT_WEBHOOK_URL == ""


def test_env_overrides(monkeypatch):
    s = _fresh_settings(
        monkeypatch,
        PUBLIC_DEMO_ENABLED="false",
        FLYWHEEL_ENABLED="false",
        WELCOME_HANDOFF_ENABLED="false",
        DAILY_DEMO_OPENAI_USD_CAP="12.50",
        DEMO_IP_HASH_SALT="overridden-salt",
        DEMO_CLAIM_HMAC_SECRET="overridden-hmac",
        TURNSTILE_SITE_KEY="test-site-key",
        TURNSTILE_SECRET_KEY="test-secret-key",
        POSTHOG_API_KEY="phk_abc123",
        SLACK_ALERT_WEBHOOK_URL="https://hooks.slack.com/services/X/Y/Z",
    )
    assert s.PUBLIC_DEMO_ENABLED is False
    assert s.FLYWHEEL_ENABLED is False
    assert s.WELCOME_HANDOFF_ENABLED is False
    assert s.DAILY_DEMO_OPENAI_USD_CAP == pytest.approx(12.50)
    assert s.DEMO_IP_HASH_SALT == "overridden-salt"
    assert s.DEMO_CLAIM_HMAC_SECRET == "overridden-hmac"
    assert s.TURNSTILE_SITE_KEY == "test-site-key"
    assert s.TURNSTILE_SECRET_KEY == "test-secret-key"
    assert s.POSTHOG_API_KEY == "phk_abc123"
    assert s.SLACK_ALERT_WEBHOOK_URL == "https://hooks.slack.com/services/X/Y/Z"
