# TODOS

## P1 — High Priority

### Supabase RLS Policies for Notifications
**What:** Add Row Level Security policies so users only see their own notifications via Realtime.
**Why:** Realtime subscriptions filter client-side by user_id, but without RLS any user could subscribe to all notifications.
**Effort:** S (human: ~2 hours / CC: ~15 min)
**Priority:** P1

---

## P2 — Medium Priority

### Mobile Landing CTA Click Analytics
**What:** Instrument click tracking on mobile landing primary CTA ("Start talking"), secondary Google link, navbar "Get Started" CTA, and measure time-to-first-click / bounce-before-CTA.
**Why:** The mobile-landing-cleanup PR reverses the primary CTA from Google-SSO to email-magic-link. That's a 1-tap → 4-step friction change. Without a baseline there's no way to detect a conversion regression. Also unblocks future A/B on CTA copy.
**Pros:** Unblocks data-driven CTA iteration. Catches regressions from the CTA reversal.
**Cons:** Needs an analytics vendor choice (PostHog / Plausible / GA4) or a lightweight backend event endpoint.
**Context:** Surfaced in 2026-04-23 `/plan-ceo-review` of mobile-landing-cleanup. Section 8 (Observability) flagged a zero-analytics posture on a strategic funnel change. HOLD SCOPE deferred this from the PR.
**Effort:** S (human: ~3 hours / CC: ~30 min)
**Priority:** P2
**Depends on:** Analytics vendor decision (1-line doc).

---

### Record-First Mobile Landing Flow
**What:** Visitor hits mobile landing → taps primary CTA → records one voice entry anonymously → THEN is prompted to save via magic-link signup. Entry is attached to the new account on signup.
**Why:** The platonic-ideal mobile landing per Step 0C of the 2026-04-23 CEO review. Current funnel asks for auth before demonstrating value; record-first inverts that. Potentially 10x mobile conversion by removing the pre-value friction.
**Pros:** Removes the "prove value before I give you my email" objection. Product demo *is* the onboarding.
**Cons:** Anonymous entry storage (ephemeral table or cookie-keyed session), Whisper cost for unauthed users (rate-limit), merge flow on signup, abuse surface.
**Context:** Surfaced in 2026-04-23 `/plan-ceo-review` as the scope-expansion option the user held. Should sequence AFTER Mobile Landing CTA Click Analytics so impact is measurable.
**Effort:** L (human: ~1 week / CC: ~4 hours)
**Priority:** P2
**Depends on:** Mobile Landing CTA Click Analytics (need baseline to measure impact).

---

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

### Extract Shared `QuoteCard` Component on `/week`
**What:** Once the `feat/personality-md` weekly-letter-polish ships, `RecurringThemesTeaser` and the `ThoughtGems` teaser will both be near-identical card components differing only by left-bar color and content source. Extract a shared `QuoteCard({leftBarColor, label, body, linkHref, linkLabel})` on the next `WeeklyReportPage.tsx` touch.
**Why:** Prevents visual drift between the two teasers. DESIGN.md's "AI Coach letters" left-bar + surface + hairline pattern is reused three times on `/week` — keeping the two teasers in one component means future spec changes happen in one place.
**Pros:** Easier theming, one place to tune spec, prevents drift.
**Cons:** Small extra abstraction. Not worth doing pre-emptively — wait until both teasers ship with the new spec so the shared shape is visible.
**Effort:** XS (human: ~20 min / CC: ~5 min).
**Priority:** P3
**Depends on:** `feat/personality-md` shipping first.
**Context:** Surfaced during 2026-04-19 `/plan-design-review` of weekly-letter-polish (ceo-plans/2026-04-19-weekly-letter-polish.md).

---

### Visual-Regression Test for `/week` Typography
**What:** Add an RTL test to `frontend/src/pages/WeeklyReportPage.test.tsx` asserting the ThoughtGems quote and RecurringThemes description both have `fontFamily` matching `/DM Sans/` and NOT `/DM Serif Display/`, plus `fontStyle: italic`.
**Why:** The weekly-letter-polish fix explicitly resolves a DESIGN.md typography violation (DM Serif Display at body size). Without a guard test, the next person touching WeeklyReportPage.tsx could re-introduce the serif without knowing, and we'd only find out in manual design review.
**Pros:** Catches the regression class explicitly. Fast test, no new infra.
**Cons:** Couples test to font-family string; if DESIGN.md ever switches body sans (unlikely), the test updates.
**Effort:** XS (human: ~15 min / CC: ~10 min).
**Priority:** P3
**Depends on:** `feat/personality-md` shipping first (so the tokens to test against exist).
**Context:** Surfaced during 2026-04-19 `/plan-design-review`. Mirrors the pattern of guarding DESIGN.md violations with tests, similar to how the stale-prefs banner already has test coverage.

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

### /week Portal Restructure — `/week/tasks` and `/week/patterns` Subpages
**What:** Split Open Loops and Themes out of the inline `/week` layout into their own subpages (`/week/tasks`, `/week/patterns`), with `/week` becoming a card-based portal that routes into subpages. Full plan in [docs/designs/thoughts-tab.md](docs/designs/thoughts-tab.md).
**Why:** The original thoughts-tab plan proposed this portal restructure. CEO review 2026-04-16 reduced v1 to Thought Garden only because `/week/tasks` and `/week/patterns` are 80% reorganizing content that already works inline on `/week`. Revisit only if the inline sections become hard to scan.
**Pros:** Cleaner IA if `/week` becomes overwhelming. Makes room for richer per-surface filtering (Active/Pinned/Resolved for themes, Open/Done/Dismissed for tasks).
**Cons:** Adds indirection tax — one more click between weekly review and the thing you want to look at. Runs against the 2026-04-10 "fold into Week, simplify" decision unless Week has genuinely grown past its scannable budget.
**Trigger to revisit:** inline Open Loops consistently exceeds ~8 items, or inline Themes section forces scroll past 1.5 viewports on mobile, or you find yourself wishing for a filter view.
**Effort:** M (human: ~2-3 days / CC: ~2-3 hours) — two new pages + route + card rewrite of `/week`.
**Priority:** P3
**Context:** Deferred from thoughts-tab CEO review 2026-04-16. Ship `/thoughts` first (reduced v1). See [docs/designs/thoughts-tab.md](docs/designs/thoughts-tab.md) for the full vision.

---

### Thought Garden AI Sections — "Questions I Keep Asking" and "Tensions"
**What:** Add two AI-generated sections to `/thoughts`: "Questions I Keep Asking" (repeated unresolved questions surfaced from REFLECTION captures) and "Tensions" (repeated conflicts or tradeoffs). Every insight must cite its source reflections; no source, no insight.
**Why:** Plan's core bet for Thought Garden — help users notice patterns in their own thinking they wouldn't otherwise catch. CEO review 2026-04-16 deferred these from v1 because they need REFLECTION volume to produce meaningful signal; thin output on a small dataset poisons trust in the feature.
**Pros:** The genuinely "magical" part of Thought Garden. Makes the page worth returning to even in slow weeks.
**Cons:** Cold-start embarrassment risk — with <50 REFLECTIONs, outputs will be weak or hallucinated. Needs prompt engineering, eval set, and citation plumbing.
**Trigger to revisit:** 2+ months of sustained REFLECTION capture (rough target: 50+ REFLECTION captures across 3+ weeks) AND v1 Thought Garden shows click-through (you're actually rereading).
**Rules:** AI-generated insights must cite source reflections. No source, no insight. Insights should invite rereading, not diagnose.
**Effort:** M (human: ~3 days / CC: ~2 hours) — prompt design, citation UI, eval cases, fallback to "not enough data yet" copy.
**Priority:** P3
**Context:** Deferred from thoughts-tab CEO review 2026-04-16. Ship Gems + Recent Reflections first. See [docs/designs/thoughts-tab.md](docs/designs/thoughts-tab.md) "Subpage 1: Thought Garden" for the full vision.

---

### Server-Side Date Filter for `/v1/captures/`
**What:** Add `?since=YYYY-MM-DD` (and optionally `?until=`) to `GET /v1/captures/` so `/thoughts` can fetch just the 3-4 weeks it renders, instead of the user's entire REFLECTION history.
**Why:** `/thoughts` currently fetches every REFLECTION the user has ever made and filters by `source_date` client-side. Fine at <500 REFLECTIONs. At 2k+, the payload crosses ~400KB and stalls on mobile 4G. One `where()` clause, zero migrations.
**Effort:** XS (human: ~20 min / CC: ~5 min) — one query param, one filter, one test.
**Priority:** P3
**Trigger to revisit:** any user crosses ~500 REFLECTIONs, or /thoughts payload shows up in slow-request logs.
**Context:** Deferred from thoughts-tab eng review 2026-04-16. Not v1-blocking because current volume is <100 REFLECTIONs total.

---

### Pin / "Gem" Affordance for Reflections
**What:** Let the user mark a REFLECTION as a "gem" — a reflection worth revisiting. Gems bubble to the top of `/thoughts` Gems section. Lightest extension of existing capture editing; no new table unless necessary.
**Why:** V1 Thought Garden shows the most recent REFLECTIONs. If the user finds themselves wanting to mark specific ones as "return to this," the pin affordance closes that loop without inventing a new concept.
**Pros:** Low concept tax (reuses the "status" or a boolean flag on captures). Builds on existing edit patterns.
**Cons:** Adds capture-surface interaction; touches the voice-first religion if the UI isn't quiet. Only worth building if rereading behavior is real.
**Trigger to revisit:** after 2-4 weeks of using v1 Thought Garden, you notice you want to mark specific reflections for return.
**Effort:** S (human: ~3 hours / CC: ~30 min) — one boolean column on captures or reuse status, one icon toggle, one filter tweak.
**Priority:** P3
**Context:** Deferred from thoughts-tab CEO review 2026-04-16. Ship Gems-as-recency first.

---

### "What We Noticed About You" Read-Only Card
**What:** Render a small card on `/week` (or settings) showing the user's top 3 active themes + recent-change signals (emerging / fading / new friction) + current coaching preferences. Read-only first; editable later.
**Why:** Trust signal — lets a user see what the system "knows" about them, without building a full personality.md surface. Cheap once the personality-aware weekly prompt (see below) is in production.
**Pros:** Reuses everything from the personality-aware weekly prompt (Approach B from `ceo-plans/2026-04-10-personality-md-direction.md`). No new storage. Concrete answer to "what does it know about me?".
**Cons:** New surface on `/week` could erode the voice-first religion if it grows beyond a small card. Keep tiny or skip.
**Trigger to revisit:** after personality-aware weekly prompt has been running for 2+ weeks AND you (or a real user) find yourself asking "what does it know about me?".
**Effort:** M (human: ~2-3 days / CC: ~1-2 hours) — pure read view over `weekly_themes` + `coaching_preferences`.
**Priority:** P3
**Context:** Deferred from personality.md CEO review (2026-04-17). Approach C in that review. Don't pre-build a trust UI before the underlying mechanism has earned trust.

---

### Pause Personalization Toggle
**What:** Add a single boolean to `coaching_preferences` (e.g., `personalization_paused`). When true, the weekly prompt skips injecting prefs + recent-change signals (themes still flow through as today). Stored prefs are not deleted.
**Why:** Trust escape hatch if the personalized weekly version ever feels off. Cheaper than per-user opt-out flows once you have multiple real users.
**Pros:** XS effort. Doesn't lose prefs when toggled. Maps cleanly to the same form section that hosts the prefs.
**Cons:** YAGNI for solo + early users — env-var kill switch is enough today.
**Trigger to revisit:** when you onboard a second real user, OR if the personalized weekly ever feels off and you reach for a toggle that doesn't exist.
**Effort:** XS (human: ~30 min / CC: ~10 min) — one bool in JSONB, one checkbox, one prompt branch.
**Priority:** P3
**Context:** Deferred from personality.md CEO review (2026-04-17). Solo + one user → env-var kill switch beats a UI toggle.

---

### Backend JWT Auth Endpoint Cleanup
**What:** Remove `/api/v1/auth/token`, `/api/v1/auth/register`, and `/api/v1/auth/refresh` from the backend after the Supabase-only frontend has been stable for 2+ weeks. Drop the `password_hash` column on `users` if it remains unused.
**Why:** After the landing-auth-redesign PR, the frontend no longer calls these endpoints (Supabase handles all auth). Orphaned auth endpoints are an attack surface and a maintenance distraction.
**Pros:** Smaller backend surface, less to test, less to secure.
**Cons:** Need to verify no internal/admin tooling still uses them. Drop column requires Alembic migration.
**Effort:** XS (human: ~30 min / CC: ~10 min) — route deletion + migration + tests.
**Priority:** P3
**Depends on:** landing-auth-redesign PR shipping + 2 weeks of stable Supabase-only auth in prod
**Context:** Deferred from /plan-eng-review 2026-04-22. Marked NOT in scope to keep auth-rewrite PR frontend-only.

---

### Cypress E2E for Supabase OTP Sign-in Flow
**What:** Add a Cypress test that exercises the full sign-in flow against a real Supabase test project: enter email → fetch OTP via Supabase admin API → submit code → land in app authenticated.
**Why:** Unit tests with mocked supabase-js cover internal logic, but they can't catch SDK version drift, dashboard config drift (e.g., "Link accounts with same email" toggled off), or OAuth callback issues.
**Pros:** Catches real-world auth regressions before users hit them.
**Cons:** Requires a dedicated Supabase test project, admin API key for OTP retrieval, and CI secret management.
**Effort:** M (human: ~4 hours / CC: ~30 min) — Cypress test + Supabase test project + CI config.
**Priority:** P3
**Context:** Deferred from /plan-eng-review 2026-04-22. Unit-level supabase-js mocking is sufficient for v1; revisit if a Supabase-side regression slips to prod.

---

## Completed

### ~~Personality.md v1 (coaching preferences)~~ — v0.3.7.0 (2026-04-18)
Per-user `coaching_preferences` JSONB on `users` (Alembic `p5q6r7s8t9u0`): tone, pacing, language_lock, avoid_topics. Strict write validation (NFKC + zero-width strip + EN/ZH prompt-injection blocklist + 60-char/10-topic caps); forgiving read normalizer (unknown enums → field defaults; malformed shape → full defaults). `GET`/`PATCH /api/v1/users/me/preferences` with omit/null/value PATCH semantics. New `/settings` page with selectors + chip editor + per-field 422 helper text + Reset. Weekly audit Stage-1 + Stage-2 inject prefs and recent-change signals (`emerging` / `fading` / `new_friction` from `weekly_signals.py`, computed relative to `week_start`). `language_lock=zh|en` hard-overrides Stage-2 detection; avoid-topics downgrade prescriptive advice. `prefs_stale` banner on `/week` with Regenerate + deep link. Server-side `applied_prefs` echo. `COACHING_PERSONALIZATION_ENABLED` env-var kill switch (default true). 70 backend + 20 frontend tests; 50/50 frontend suite green, tsc clean.

### ~~Thought Garden v1 (/thoughts)~~ — v0.3.5.0 (2026-04-16)
New `/thoughts` page that shows this week's REFLECTIONs as "Gems" and prior 3 weeks as grouped "Recent Reflections". `?week_start=YYYY-MM-DD` deep-links. Thought Gems card on `/week` binds to the selected week. 13 frontend tests cover URL handling, Monday-boundary filtering, null-safety, and source-day links. Zero backend changes; reuses `capturesApi.list({ category: 'REFLECTION' })`.

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
