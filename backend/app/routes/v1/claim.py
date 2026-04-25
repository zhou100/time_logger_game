"""
/api/v1/entries/claim-demo-session — claim anonymous demo entries on signup.

A user who recorded anonymously on the landing page receives a `claim_token`
in the body of `/v1/public/demo/presign`. The frontend stores it (currently
sessionStorage), passes it through Supabase OAuth state, and POSTs it here
under the new user's JWT immediately after signup.

The claim is a single-transaction UPDATE that flips ownership on the
existing rows (no copy-and-delete). Per the design doc "Atomicity: DB first,
blob cleanup via sweep" section, S3 blobs are NOT touched — they remain at
the same key, now referenced by a row owned by the user. The sweep job only
deletes rows whose `expires_at` is in the past AND `user_id IS NULL`, so
claimed rows are safe.

Idempotency is by construction: the WHERE clause requires `user_id IS NULL`,
so a second call after a successful claim updates zero rows.

The HttpOnly cookie `tlg_demo_sid` is intentionally NOT cleared server-side.
JavaScript can't clear it and we don't need to — it expires naturally at
24h, and the entries it referenced are now owned by the user so it can't be
abused to claim them again.
"""
from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from ...db import get_db
from ...models.entry import Entry
from ...models.jobs import Job
from ...models.user import User
from ...services import analytics as analytics_svc
from ...services import metrics as metrics_svc
from ...services.demo_tokens import verify_claim_token
from ...utils.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/entries", tags=["entries"])

# Same cookie name as set by /v1/public/demo/verify-turnstile.
_DEMO_SESSION_COOKIE = "tlg_demo_sid"


class ClaimDemoSessionRequest(BaseModel):
    claim_token: str


class ClaimDemoSessionResponse(BaseModel):
    claimed: int
    entry_ids: List[str]


@router.post(
    "/claim-demo-session",
    response_model=ClaimDemoSessionResponse,
)
async def claim_demo_session(
    body: ClaimDemoSessionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ClaimDemoSessionResponse:
    session_id = verify_claim_token(body.claim_token)
    if session_id is None:
        # Silent 200 — leaks no information about which token shape failed.
        analytics_svc.capture_demo_event(
            "demo_claim",
            demo_session_id=None,
            properties={"result": "missing", "claimed_count": 0},
        )
        metrics_svc.demo_claims_total.labels(result="missing").inc()
        return ClaimDemoSessionResponse(claimed=0, entry_ids=[])

    # Cookie pin: when the demo session cookie is present, it MUST match the
    # token's session_id. This blocks the leaked-URL attack — an attacker
    # who obtains the claim_token from history/screenshots/referrers cannot
    # claim the entries unless they also have the original browser's
    # HttpOnly cookie. When the cookie is absent (Safari ITP, blocked
    # cookies, fresh browser) we fall back to token-only — the spec's
    # intentional dual path keeps cookie-blocked users functional.
    cookie_session = request.cookies.get(_DEMO_SESSION_COOKIE)
    if cookie_session and cookie_session != session_id:
        analytics_svc.capture_demo_event(
            "demo_claim",
            demo_session_id=session_id,
            properties={"result": "missing", "claimed_count": 0,
                        "reason": "cookie_session_mismatch"},
        )
        metrics_svc.demo_claims_total.labels(result="missing").inc()
        return ClaimDemoSessionResponse(claimed=0, entry_ids=[])

    try:
        # Single transaction: flip ownership on entries + jobs. The order
        # within the transaction doesn't matter; both UPDATEs commit together.
        # `user_id IS NULL` guard makes this idempotent — replays no-op.
        stmt_entries = (
            update(Entry)
            .where(
                Entry.demo_session_id == session_id,
                Entry.user_id.is_(None),
            )
            .values(
                user_id=current_user.id,
                demo_session_id=None,
                expires_at=None,
            )
            .returning(Entry.id)
        )
        result = await db.execute(stmt_entries)
        entry_ids = [str(row[0]) for row in result.all()]

        stmt_jobs = (
            update(Job)
            .where(
                Job.demo_session_id == session_id,
                Job.user_id.is_(None),
            )
            .values(
                user_id=current_user.id,
                demo_session_id=None,
            )
        )
        await db.execute(stmt_jobs)

        await db.commit()
    except Exception:
        analytics_svc.capture_demo_event(
            "demo_claim",
            demo_session_id=session_id,
            properties={"result": "failed", "claimed_count": 0},
        )
        metrics_svc.demo_claims_total.labels(result="failed").inc()
        raise

    if entry_ids:
        logger.info(
            "Claimed %d demo entries for user_id=%s",
            len(entry_ids),
            current_user.id,
        )
    result_label = "succeeded" if entry_ids else "missing"
    analytics_svc.capture_demo_event(
        "demo_claim",
        demo_session_id=session_id,
        properties={"result": result_label, "claimed_count": len(entry_ids)},
    )
    metrics_svc.demo_claims_total.labels(result=result_label).inc()

    return ClaimDemoSessionResponse(claimed=len(entry_ids), entry_ids=entry_ids)
