# TODOS

## P1 — High Priority

### Supabase RLS Policies for Notifications
**What:** Add Row Level Security policies so users only see their own notifications via Realtime.
**Why:** Realtime subscriptions filter client-side by user_id, but without RLS any user could subscribe to all notifications.
**Effort:** S (human: ~2 hours / CC: ~15 min)
**Priority:** P1

---

## P2 — Medium Priority

### Re-enable or Remove Module-Skipped Backend Test Files
**What:** 5 test files carry `pytest.skip(..., allow_module_level=True)` added on this branch: `test_auth.py`, `test_auth_integration.py`, `test_categorization.py`, `e2e/auth/test_auth_flow.py`, `e2e/test_users.py`. Either fix the environment/fixture issues and unskip them, or delete the orphaned files outright.
**Why:** Codex adversarial review flagged that branch-level module skips disable auth coverage while this branch adds a new protected endpoint. Auth regressions the tests would catch are currently invisible.
**Effort:** S (human: ~2–3 hours / CC: ~45 min) — triage each file, re-enable the ones that are just missing fixtures/env, delete the truly-legacy ones.
**Priority:** P2
**Context:** Deferred from past-record-search ship (2026-04-10). Not blocking this ship because the skips predate the search work and the search endpoint has its own 8-test suite in `test_entries_search.py`.

---

### Category Filter Legacy Mapping
**What:** Verify whether the DB still holds legacy `IDEA` / `THOUGHT` category rows, and if so, make the `category=` search filter accept either the legacy or the new normalized name.
**Why:** Codex flagged that `category=EXPERIMENT` / `REFLECTION` may silently hide old records if the DB still has pre-rename values, since the filter matches the raw column.
**Effort:** S (human: ~1 hour / CC: ~20 min) — one DB inspection query + either a data migration or a filter expansion.
**Priority:** P2
**Context:** Deferred from past-record-search ship (2026-04-10). Unconfirmed — may be a false positive if a prior rename migration already normalized stored values.

---

### pg_trgm GIN Indexes for Search at Scale
**What:** Add pg_trgm extension + GIN indexes on `entries.transcript` and `entry_classifications.extracted_text` / `edited_text` so `ILIKE '%q%'` uses trigram search instead of a sequential scan.
**Why:** Current `/api/v1/entries/search` uses unanchored ILIKE, which is O(N) per column. Fine for today's volume, but once any user crosses a few thousand entries the endpoint will start stalling the event loop. Trigram indexes let Postgres serve the same query shape without changing the route.
**Effort:** S (human: ~1 hour / CC: ~20 min) — one Alembic migration creating the extension + three indexes, no code changes.
**Priority:** P2
**Depends on:** Nothing — can ship any time before scale hits.
**Context:** Deferred from past-record-search eng review (2026-04-10). User confirmed current volume is fine; revisit when an individual user approaches ~5k entries or the search route shows up in slow-query logs.

---

## P3 — Low Priority

### Single-Item API for Past Week Detail
**What:** Add `GET /api/v1/entries/audit/weekly/:audit_date` that returns one `WeeklyAuditHistoryItem`. Update `PastWeekDetailPage` to call it instead of fetching all 50 history items and filtering client-side.
**Why:** Current approach fetches the entire history list to display one review. Works fine at single-digit review counts, but grows linearly. At 100+ weeks it's wasted bandwidth and latency.
**Effort:** S (human: ~1 hour / CC: ~10 min) — one new endpoint + one frontend fetch change.
**Priority:** P3
**Context:** Deferred from CEO review of Day/Week separation (2026-04-12). Not blocking because current volume is ~3 reviews.

---

### Strip Malformed `?date=` URL Param on Fallback
**What:** When `/?date=banana` or `/?date=9999-12-31` loads, the RecordingPage correctly falls back to today's data but leaves the invalid param in the address bar. Extend the URL-sync `useEffect` to call `setSearchParams` and delete the bad param whenever `sanitizeDateParam` returns null.
**Why:** If a user copies and shares a malformed deep-link, the recipient sees today's data under a URL that implies a different date. Cosmetic mismatch between address bar and rendered state. Data correctness is already intact (the original HIGH finding from adversarial review — "bad param reaches backend" — is fully fixed).
**Effort:** XS (human: ~15 min / CC: ~5 min) — one `if` block in the existing `useEffect`.
**Priority:** P3
**Context:** Deferred from past-record-search QA (2026-04-11). Found as ISSUE-001 in `.gstack/qa-reports/qa-report-localhost-2026-04-11.md`.

---

### Integration Test for Search Query Behavior
**What:** Add a pytest integration test that exercises `/api/v1/entries/search` against a real Postgres (not mocks) to verify ILIKE escaping, match_sources provenance, and category filter semantics end-to-end.
**Why:** Current backend tests mock the DB, so they only verify the query *was built*, not that it *returns the right rows*. A regression in SQL construction (e.g. escaping, join direction, filter semantics) would pass unit tests but break prod.
**Effort:** S (human: ~2 hours / CC: ~30 min) — reuse existing integration test fixtures, seed a handful of entries with known transcripts and classifications, assert on returned IDs and match_sources.
**Priority:** P3
**Context:** Deferred from past-record-search eng review (2026-04-10). Ship the feature with mocked unit tests; add integration coverage before the next search-related change.

---

### Saved Retrieval Chips
**What:** Let users save a search query (text + category + date range) as a named chip on the search page, so they can re-run "last week's TODOs" or "all REFLECTION entries this month" with one click.
**Why:** The CEO plan frames search as retrieval v1 toward a memory-layer product. Saved chips are the smallest step from "I can search" to "the app remembers what I care about retrieving." Also removes friction from the weekly-review loop.
**Effort:** M (human: ~1 day / CC: ~2 hours) — new `saved_searches` table, CRUD endpoints, chip UI on SearchPage, serialize/restore from URL params.
**Priority:** P3
**Context:** Deferred from past-record-search eng review (2026-04-10). Wait for search to see real usage before committing to this shape — users may want something more powerful (e.g. full saved dashboards) or something simpler (e.g. browser bookmarks are enough).

---

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

### ~~Move Endpoint Should Update local_date~~ — 2026-04-11
Moving an entry now updates `local_date` alongside `created_at` / `recorded_at`, invalidates source and target audit dates, and has regression coverage for moving to an empty target day.

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
