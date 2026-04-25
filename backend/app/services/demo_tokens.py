"""
HMAC-signed token helpers shared by the public demo endpoints and the claim
endpoint. Two token shapes:

  permit_token = "session|exp_iso|uses_remaining|signature"
                 issued by /verify-turnstile, consumed by /presign and /submit.
                 Failure raises HTTPException so route handlers can return 401
                 with the appropriate error code.

  claim_token  = "session|exp_iso|signature"
                 returned by /presign, threaded through Supabase OAuth state,
                 consumed by /v1/entries/claim-demo-session.
                 Failure returns None — claim endpoint treats invalid/expired
                 tokens as a silent no-op per the design spec.

Both signed with `settings.DEMO_CLAIM_HMAC_SECRET` (SHA-256). Keeping these
helpers in one place avoids drift between the two routes — a divergence in
the format or signing key would silently break the OAuth round-trip.
"""
from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timezone
from typing import Tuple

from fastapi import HTTPException

from ..settings import get_settings


def _secret() -> str:
    """Read fresh on each call so test fixtures that swap env vars
    + clear the lru_cache are picked up without reloading this module."""
    return get_settings().DEMO_CLAIM_HMAC_SECRET


def _hmac_sign(message: str, secret: str) -> str:
    return hmac.new(
        secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def _hmac_verify(message: str, signature: str, secret: str) -> bool:
    return hmac.compare_digest(_hmac_sign(message, secret), signature)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def parse_iso(s: str) -> datetime:
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def build_permit_token(session_id: str, exp: datetime, uses_remaining: int) -> str:
    payload = f"{session_id}|{iso(exp)}|{uses_remaining}"
    sig = _hmac_sign(payload, _secret())
    return f"{payload}|{sig}"


def parse_permit_token(token: str) -> Tuple[str, datetime, int]:
    if not token or token.count("|") != 3:
        raise HTTPException(status_code=401, detail={"error": "invalid_permit"})
    session_id, exp_iso, uses_str, sig = token.split("|", 3)
    payload = f"{session_id}|{exp_iso}|{uses_str}"
    if not _hmac_verify(payload, sig, _secret()):
        raise HTTPException(status_code=401, detail={"error": "invalid_permit"})
    try:
        exp = parse_iso(exp_iso)
        uses = int(uses_str)
    except ValueError:
        raise HTTPException(status_code=401, detail={"error": "invalid_permit"})
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail={"error": "permit_expired"})
    if uses <= 0:
        raise HTTPException(status_code=401, detail={"error": "permit_exhausted"})
    return session_id, exp, uses


def build_claim_token(session_id: str, exp: datetime) -> str:
    payload = f"{session_id}|{iso(exp)}"
    sig = _hmac_sign(payload, _secret())
    return f"{payload}|{sig}"


def verify_claim_token(token: str) -> str | None:
    """Returns session_id on success, None on any failure (silent semantics)."""
    if not token:
        return None
    parts = token.split("|", 2)
    if len(parts) != 3:
        return None
    session_id, exp_iso, signature = parts
    payload = f"{session_id}|{exp_iso}"
    if not _hmac_verify(payload, signature, _secret()):
        return None
    try:
        exp = parse_iso(exp_iso)
    except ValueError:
        return None
    if exp < datetime.now(timezone.utc):
        return None
    return session_id
