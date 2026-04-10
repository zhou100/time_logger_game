# TODOS

## P1 — High Priority

### Supabase RLS Policies for Notifications
**What:** Add Row Level Security policies so users only see their own notifications via Realtime.
**Why:** Realtime subscriptions filter client-side by user_id, but without RLS any user could subscribe to all notifications.
**Effort:** S (human: ~2 hours / CC: ~15 min)
**Priority:** P1

---

## P3 — Low Priority

### Ambient Theme Cue Above Record Button
**What:** Rotate one pinned theme as a single line above the record button (e.g. *"You said deep-work mornings matter. It's 9:17."*). Time-of-day-aware. No popup, no animation, just text.
**Why:** Atomic Habits "make it obvious" — turn the recorder surface into an ambient cue at the moment of action. Raises self-awareness from once/week to once/session.
**Pros:** Closes the awareness loop at the actual decision point. Zero new schema (uses existing pinned themes).
**Cons:** Touches the sacred click-and-record surface. If it feels naggy, it poisons the core loop. Defer until streak dots + theme injection in daily prompt have proven the broader theme system feels right.
**Context:** Deferred from Atomic Habits review (2026-04-08). Build #1 (streak dots) and #2 (themes in daily prompt) first, use for a few days, then decide whether this earns its pixels. If shipped, copy should be LLM-generated per theme at weekly review time and stored on the theme row.
**Effort:** S (human: ~2 hours / CC: ~20 min)
**Priority:** P3
**Depends on:** #1 streak dots and #2 theme injection in daily prompt shipping first

---

### Presigned URL Content-Type Validation

**What:** Validate the `content_type` parameter on the presign endpoint to restrict to audio MIME types.
**Why:** Adversarial review flagged that unvalidated content_type allows arbitrary file upload.
**Effort:** XS (human: ~15 min / CC: ~5 min)
**Priority:** P3

---

## Completed

### ~~Notifications Table Cleanup~~ — 2026-04-09
Worker loop now prunes notification rows older than 24h every hour. Added `ix_notifications_created_at` index for efficient deletes.

### ~~Worker Error Message Sanitization~~ — 2026-04-09
Worker failure notification payload now sends a generic "Processing failed" message instead of raw `str(exc)`. Full traceback still logged server-side via `exc_info=True`.

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
