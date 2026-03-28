# TODOS

## P1 — High Priority

### Cron Ping for Backend Warm-Up
**What:** Set up a free external cron service (e.g., cron-job.org or UptimeRobot) to hit `https://time-logger-backend.onrender.com/health` every 14 minutes.
**Why:** Render free tier cold-starts take 30-50s. A periodic ping keeps the backend warm so users never wait.
**Effort:** XS (human: ~10 min / CC: N/A — external service config)
**Priority:** P1

---

### Supabase RLS Policies for Notifications
**What:** Add Row Level Security policies so users only see their own notifications via Realtime.
**Why:** Realtime subscriptions filter client-side by user_id, but without RLS any user could subscribe to all notifications.
**Effort:** S (human: ~2 hours / CC: ~15 min)
**Priority:** P1

---

## P2 — Medium Priority

### Render Warm-Up Checklist
**What:** Hit `/health` endpoint 5 minutes before demo.
**Why:** Render.com free tier cold-starts can add 10-30s on first request.
**Effort:** S (human: 5 min / CC: 5 min — operational, not code)
**Priority:** P2

---

### Notifications Table Cleanup
**What:** Add TTL or archival for the notifications table to prevent unbounded growth.
**Why:** Adversarial review flagged that notification rows accumulate indefinitely.
**Effort:** S (human: ~1 hour / CC: ~10 min)
**Priority:** P2

---

### Worker Error Message Sanitization
**What:** Sanitize internal error messages in worker failure notifications before sending to frontend.
**Why:** Adversarial review flagged that raw Python exception messages may leak to the client via notification payload.
**Effort:** S (human: ~1 hour / CC: ~10 min)
**Priority:** P2

---

## P3 — Low Priority

### Presigned URL Content-Type Validation

**What:** Validate the `content_type` parameter on the presign endpoint to restrict to audio MIME types.
**Why:** Adversarial review flagged that unvalidated content_type allows arbitrary file upload.
**Effort:** XS (human: ~15 min / CC: ~5 min)
**Priority:** P3

---

## Completed

### ~~Old Model Cleanup~~ — v0.2.0.0 (2026-03-26)
Removed Audio, CategorizedEntry, old /api routes, and routers/ directory in v2 revamp.

### ~~Audit Persistence~~ — v0.2.0.0 (2026-03-26)
Implemented in Phase 3b with AuditResult model and cache.

### ~~Legacy Categorization Test Cleanup~~ — v0.2.0.0 (2026-03-26)
Cleaned up in Phase 4. New test suites for categorization service, worker, and validators.

### ~~Supabase Auth Migration~~ — v0.2.0.0 (2026-03-26)
Implemented in Phase 1 with Supabase JWT support, Google OAuth, and user auto-creation.

### ~~E2E Smoke Test~~ — v0.2.0.0 (2026-03-26)
Multi-entry pipeline tested via unit tests. Integration tests exist for DB-dependent paths.

### ~~Insecure Default SECRET_KEY~~ — v0.2.0.0 (2026-03-26)

Deleted `core/auth.py` in Phase 4 cleanup. `settings.py` default is overridden by `generateValue: true` in render.yaml.

### ~~R2 Bucket Provisioning~~ — v0.2.0.0 (2026-03-27)

R2 bucket created in Cloudflare dashboard, CORS configured, API credentials added to Render env vars.
