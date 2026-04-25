"""Shared helpers for the public-demo test files.

Several files were rebuilding the same MagicMock(spec=Entry) row and the
same Cloudflare header dict. Hoisted here so fixture drift across files
is impossible. Not a conftest fixture because callers use these as plain
functions, not pytest-injected arguments.
"""
from __future__ import annotations

from unittest.mock import MagicMock


_DEFAULT_DEMO_IP_HEADERS = {
    "cf-connecting-ip": "203.0.113.7",
    "cf-ray": "ray-1",
}


def make_anon_entry(entry_id, session_id, *, transcript=None):
    """MagicMock-spec'd Entry shaped like an anonymous demo row.

    transcript is always explicitly set (default None) so the StatusResponse
    pydantic validator sees a real value rather than a sub-Mock.
    """
    from app.models.entry import Entry

    e = MagicMock(spec=Entry)
    e.id = entry_id
    e.user_id = None
    e.demo_session_id = session_id
    e.transcript = transcript
    return e


def demo_headers(*, cookie: str | None = None) -> dict:
    """Headers that pass demo IP extraction + optional session cookie."""
    h = dict(_DEFAULT_DEMO_IP_HEADERS)
    if cookie is not None:
        h["cookie"] = f"tlg_demo_sid={cookie}"
    return h
