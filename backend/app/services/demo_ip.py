"""
Client IP extraction + hashing for the anonymous demo flow.

Raw IP bytes are never logged or persisted. We accept the IP only long
enough to hash it with `DEMO_IP_HASH_SALT` and throw the original away.

Trust chain:
  - Cloudflare in front → `CF-Connecting-IP` is authoritative, but only
    when `CF-Ray` is also present (proves the request actually transited
    Cloudflare). Spoofing either header alone is trivial; requiring both
    means an attacker needs a real Cloudflare-assigned trace ID.
  - Render behind Cloudflare → `X-Forwarded-For` is appended by the
    platform proxy. The last hop is the one Render observed (trusted).
    Use it only when we don't have a Cloudflare signal.
  - Neither signal → reject. Treating a request with no proxy trail as
    "maybe localhost" opens the door to rate-limit evasion via synthetic
    CF headers.
"""
from __future__ import annotations

import hashlib
from typing import Optional

from fastapi import HTTPException, Request

from ..settings import settings


def _last_hop(xff: str) -> Optional[str]:
    """Rightmost entry of an X-Forwarded-For chain; None if empty."""
    parts = [p.strip() for p in xff.split(",") if p.strip()]
    return parts[-1] if parts else None


def extract_client_ip(request: Request) -> str:
    """
    Return the raw client IP or raise HTTPException(400, untrusted_origin).

    Raw IP escapes this function only as a return value to the immediate
    caller, which MUST hash it before any logging/persistence.
    """
    headers = request.headers
    cf_ip = headers.get("cf-connecting-ip")
    cf_ray = headers.get("cf-ray")
    if cf_ip and cf_ray:
        return cf_ip

    xff = headers.get("x-forwarded-for")
    if xff:
        last = _last_hop(xff)
        if last:
            return last

    raise HTTPException(
        status_code=400, detail={"error": "untrusted_origin"}
    )


def hash_ip(ip: str) -> str:
    """SHA-256(ip + salt) → 64-char hex. Deterministic for a given salt."""
    salt = settings.DEMO_IP_HASH_SALT or ""
    return hashlib.sha256((ip + salt).encode("utf-8")).hexdigest()


def extract_hashed_ip(request: Request) -> str:
    """Combined helper: extract and hash in one call."""
    return hash_ip(extract_client_ip(request))
