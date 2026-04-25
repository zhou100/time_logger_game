"""Tests for app.services.demo_ip — client IP extraction + hashing."""
from __future__ import annotations

import hashlib

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers
from starlette.requests import Request

from app.services.demo_ip import (
    extract_client_ip,
    extract_hashed_ip,
    hash_ip,
)
from app.settings import settings


def _make_request(headers: dict) -> Request:
    """Build a minimal Starlette Request with the given headers."""
    raw_headers = [
        (k.lower().encode(), v.encode()) for k, v in headers.items()
    ]
    scope = {
        "type": "http",
        "method": "POST",
        "headers": raw_headers,
        "path": "/",
        "query_string": b"",
        "client": ("127.0.0.1", 12345),
    }
    return Request(scope)


def test_cf_connecting_ip_honored_with_cf_ray():
    req = _make_request({
        "cf-connecting-ip": "203.0.113.7",
        "cf-ray": "8abcde1234-IAD",
    })
    assert extract_client_ip(req) == "203.0.113.7"


def test_cf_connecting_ip_ignored_without_cf_ray():
    # CF-Connecting-IP alone is spoofable; require CF-Ray to trust it.
    req = _make_request({
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.1, 10.0.0.2",
    })
    assert extract_client_ip(req) == "10.0.0.2"


def test_xff_last_hop_fallback():
    req = _make_request({
        "x-forwarded-for": "198.51.100.1, 198.51.100.2, 10.0.0.9",
    })
    assert extract_client_ip(req) == "10.0.0.9"


def test_xff_single_ip():
    req = _make_request({"x-forwarded-for": "198.51.100.1"})
    assert extract_client_ip(req) == "198.51.100.1"


def test_both_missing_rejects_400():
    req = _make_request({})
    with pytest.raises(HTTPException) as ei:
        extract_client_ip(req)
    assert ei.value.status_code == 400
    assert ei.value.detail == {"error": "untrusted_origin"}


def test_hash_deterministic_and_salted():
    salted = hash_ip("203.0.113.7")
    expected = hashlib.sha256(
        ("203.0.113.7" + settings.DEMO_IP_HASH_SALT).encode("utf-8")
    ).hexdigest()
    assert salted == expected
    assert len(salted) == 64


def test_hash_differs_between_ips():
    assert hash_ip("1.2.3.4") != hash_ip("5.6.7.8")


def test_extract_hashed_ip_combines_helpers():
    req = _make_request({
        "cf-connecting-ip": "203.0.113.7",
        "cf-ray": "ray-xyz",
    })
    hashed = extract_hashed_ip(req)
    assert hashed == hash_ip("203.0.113.7")


def test_raw_ip_never_returned_from_hashed_helper():
    req = _make_request({
        "cf-connecting-ip": "203.0.113.7",
        "cf-ray": "ray-xyz",
    })
    hashed = extract_hashed_ip(req)
    # Hex chars only — no dots, no original octets.
    assert "203.0.113" not in hashed
    assert all(c in "0123456789abcdef" for c in hashed)


def test_xff_trims_whitespace():
    req = _make_request({"x-forwarded-for": "  10.0.0.5  "})
    assert extract_client_ip(req) == "10.0.0.5"


def test_empty_xff_rejects():
    req = _make_request({"x-forwarded-for": "   "})
    with pytest.raises(HTTPException):
        extract_client_ip(req)
