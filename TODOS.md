# TODOS

## P1 — High Priority

### R2/MinIO Object Storage Setup (Phase 0)
**What:** Configure Cloudflare R2 or MinIO for audio file storage with presigned URLs.
**Why:** Deferred from v2 plan Phase 0. Currently using local/mock storage — needs real object storage for production.
**Effort:** M (human: ~4 hours / CC: ~30 min)
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

### Insecure Default SECRET_KEY
**What:** Remove the fallback `"your-secret-key"` default in `core/auth.py`. Require SECRET_KEY env var.
**Why:** Adversarial review flagged that the default secret key is insecure if env var is not set.
**Effort:** XS (human: ~15 min / CC: ~5 min)
**Priority:** P3

---

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
