# TODOS

## P1 — High Priority

### Supabase RLS Policies for Notifications
**What:** Add Row Level Security policies so users only see their own notifications via Realtime.
**Why:** Realtime subscriptions filter client-side by user_id, but without RLS any user could subscribe to all notifications.
**Effort:** S (human: ~2 hours / CC: ~15 min)
**Priority:** P1

---

## P2 — Medium Priority

### test_demo_settings env-precedence flake
**What:** `tests/test_demo_settings.py::test_defaults_load` asserts `DEMO_IP_HASH_SALT == "test-salt-do-not-use-in-prod"` (the value in `backend/.env.test`), but pydantic-settings loads `backend/.env` first when present. Any developer who sets a local `DEMO_IP_HASH_SALT` override in their gitignored `.env` for dogfooding fails this test.
**Why:** Failure is purely local — `.env` is gitignored so CI doesn't hit it. But it makes `pytest` red on every dev's machine if they set up Cloudflare test keys per the v0.5.0.0 dogfooding instructions.
**Fix:** Either (a) the test should set `DEMO_IP_HASH_SALT` via `monkeypatch.setenv` before reading settings, or (b) settings load order should ignore `.env` when running under pytest (PYTEST_CURRENT_TEST is set), or (c) `.env.test` should win.
**Effort:** S (human: ~30 min / CC: ~10 min)
**Priority:** P2
**Context:** Surfaced in v0.5.0.0 ship pre-flight. Test is currently `--deselect`'d in the ship workflow.

---

### Explicit `/recording` route in App.tsx
**What:** Add a top-level `<Route path="/recording" element={...}>` to `frontend/src/App.tsx`. Currently `/welcome`'s "See all my entries →" link points at `/recording`, which resolves via the catch-all `<Route path="*" element={<Navigate to="/" replace />}>` → `HomePage` → `RecordingPage` for authed users. Works, but the indirection makes the routing intent unclear and the URL invisible to bookmarking.
**Why:** Surfaced in v0.5.0.0 item 5. The plan assumed `/recording` was a real route; we shipped without adding one because `HomePage` already mounts `RecordingPage` for authed users.
**Effort:** XS (human: ~15 min / CC: ~5 min) — likely just an alias route to the same component.
**Priority:** P2

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

### Time-of-day Aware "Try saying…" Prompts on Landing
**What:** Rotate the "Try saying…" example prompts on the landing page based on the visitor's local clock. Morning prompts ("Today feels like a fresh start…"), afternoon prompts ("I've been pulled in too many directions today…"), evening prompts ("Looking back at today I…"). Client-side detection via `new Date().getHours()`, three prompt sets defined in the landing component.
**Why:** Static prompts get stale and can feel impersonal; time-aware prompts meet the visitor where they are emotionally. Small delight item, reduces blank-state friction.
**Pros:** Cheap (no backend change), adds personality, matches journal aesthetic.
**Cons:** Marginal until A/B data shows which prompts convert best.
**Effort:** XS (human: ~15 min / CC: ~5 min).
**Priority:** P3
**Depends on:** interaction-first landing shipping first.
**Context:** Deferred from 2026-04-24 /plan-ceo-review (ceo-plans/2026-04-24-interaction-first-landing.md). Accepted static prompts in v1; this is the polish pass.

---

### Inline Waveform on Landing Mic Button
**What:** Replace the pulse animation on the landing-page mic button with a real-time waveform during recording, using Web Audio `AnalyserNode` + `getByteFrequencyData`. The in-app `RecordButton` already has a visual state; this TODO is specifically for the landing-page hero mic, where the "voice affordance" needs to feel more alive than a pulse.
**Why:** The interaction-first pivot depends on visitors believing "this thing is really listening." A live waveform sells that in a way a pulse can't. Potential lever on the `mic_tapped → recording_completed` funnel step.
**Pros:** Strong delight signal, reinforces the product's core promise.
**Cons:** Marginal if the pulse already converts; 30 min of work unless base conversion is weak.
**Effort:** S (human: ~30 min / CC: ~15 min).
**Priority:** P3
**Depends on:** interaction-first landing shipping + PostHog data showing mic_tap → complete drop-off worth optimizing.
**Context:** Deferred from 2026-04-24 /plan-ceo-review. Revisit after 2 weeks of funnel data.

---

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

### Demo cost-cap: reserve-at-submit instead of debit-at-use
**What:** `/v1/public/demo/submit` does a read-only cost-cap check, then debits in the worker post-Whisper. Under burst load (N concurrent submits all see `current_cost < cap`), the actual daily spend can overshoot by up to N × per-request cost. Mitigated for solo abusers by `submit_per_ip_day=10`, but coordinated traffic from N IPs can blow the cap.
**Fix:** Reserve expected cost at /submit time under SELECT FOR UPDATE on demo_cost_counter (optimistic charge of e.g. $0.05); reconcile actual in worker.
**Why deferred:** Cloudflare + rate limits provide reasonable protection for v1; the overshoot window is documented in the design spec.
**Effort:** S (human: ~2 hours / CC: ~30 min)
**Priority:** P2
**Surfaced by:** /review adversarial pass on v0.5.0.0 PR (Codex + Claude agreed)

---

### Sweep races active uploads + post-claim row preservation
**What:** Two related races in `services/demo_sweep.py`: (a) sweep can delete an entry between presign and submit if the user takes >24h between the two — submit then 404s; (b) sweep snapshots expired ids then deletes by `id IN (...)`, but if a user claims the session in between, the row is no longer anonymous (`user_id IS NOT NULL`) yet still gets deleted with classifications/jobs CASCADE.
**Fix:** Add a 5-minute grace period to expires_at filter (`WHERE expires_at < now() - interval '5 min'`); add `AND user_id IS NULL` to the final DELETE (defense in depth even though the SELECT already filters this); exclude rows referenced by Job rows in PENDING/PROCESSING.
**Effort:** XS (human: ~30 min / CC: ~10 min)
**Priority:** P2
**Surfaced by:** /review adversarial pass on v0.5.0.0 PR (Codex + Claude agreed)

---

### In-memory rate limits don't span replicas
**What:** `_RATE_BUCKETS` is process-local. When the backend scales to N replicas (or during rolling restarts), the effective per-IP limit becomes N × the configured value. An attacker spreading traffic across instances bypasses the intended caps, which compounds the cost-cap overshoot problem above.
**Fix:** Move counters to Redis or use a SlowAPI store backed by Redis. Or (simpler) gate at Cloudflare with WAF rules so the in-memory limits become defense-in-depth.
**Why deferred:** Currently single-instance on Render; flag immediately if scaling out.
**Effort:** M (human: ~4 hours / CC: ~1 hour) for Redis backend
**Priority:** P2
**Surfaced by:** /review adversarial pass on v0.5.0.0 PR (Codex)

---

### Submit `_record_rate` writes before `db.commit()`
**What:** In `routes/public_demo.py::submit`, the `_record_rate("submit_per_session_hour")` and `_record_rate("submit_per_ip_day")` calls run before `db.commit()`. If the commit fails (constraint violation, connection drop), the rate counter has already counted a submit that didn't happen — user is locked out of submitting again for an hour with no entry to show.
**Fix:** Move `_record_rate` calls to after the `db.commit()` in the success path; wrap in a try/finally so a commit failure doesn't leak the counter increment.
**Effort:** XS (human: ~15 min / CC: ~5 min)
**Priority:** P3
**Surfaced by:** /review adversarial pass on v0.5.0.0 PR (Claude)

---

### Teaser blocklist needs to be pre-stemmed at load time
**What:** `services/teaser_blocklist.txt` contains raw words (profanity + first names). The match in `services/teaser.py` happens against Porter-stemmed transcript tokens, but the blocklist is loaded as raw words. If "abigail" in the blocklist doesn't equal `porter("abigail")`, the blocklist silently fails to match — PII (first names) can leak through into teaser cards.
**Fix:** Pre-stem the blocklist at module-load time. Also reconsider the "any blocklisted stem aborts whole teaser" semantics — per-stem block (skip just that stem) might be less drastic.
**Effort:** XS (human: ~20 min / CC: ~10 min)
**Priority:** P2
**Surfaced by:** /review adversarial pass on v0.5.0.0 PR (Claude)

---

### Frontend setState after unmount + orphan demo entries
**What:** `useDemoRecording.ts::pollStatus` recursively schedules setTimeout → setState. Cleanup useEffect clears the current timer ref but in-flight setTimeouts persist. Worse: `recorder.onstop` calls `presign + setState` after teardownStream — the in-flight presign creates an `Entry` row in the DB that the user will never claim → orphan tombstones until the 24h sweep. Turnstile callback can also fire after the widget is removed → React warnings.
**Fix:** Track an `isMounted` ref in `useDemoRecording`; bail out of setState + network calls when unmounted. Cancel in-flight `fetch` with `AbortController` so the presign never lands.
**Effort:** S (human: ~1 hour / CC: ~20 min)
**Priority:** P3
**Surfaced by:** /review adversarial pass on v0.5.0.0 PR (Claude)

---

### Migration uses CREATE INDEX without CONCURRENTLY
**What:** Alembic migration `q6r7s8t9u0v1` creates partial indexes on `entries(demo_session_id)` etc without `CONCURRENTLY`. On a non-empty `entries` table, this takes an ACCESS EXCLUSIVE lock that blocks writes during deploy. Also: the migration `ALTER COLUMN entries.user_id DROP NOT NULL` is irreversible while any anonymous row exists (downgrade fails, by design — but worth documenting).
**Fix:** Use `CREATE INDEX CONCURRENTLY` (requires running outside transaction — Alembic supports `op.execute_atomic=False` or split into a separate revision). Document the downgrade prerequisite (delete demo rows manually first).
**Effort:** S (human: ~1 hour / CC: ~30 min)
**Priority:** P3 (only matters when entries table is large in prod)
**Surfaced by:** /review adversarial pass on v0.5.0.0 PR (Claude)

---

### Slack alert wiring on cost > 80% / sweep stall
**What:** Add a small alerting helper that POSTs to `SLACK_ALERT_WEBHOOK_URL` when `demo_cost_usd_today >= 0.8 * DAILY_DEMO_OPENAI_USD_CAP` or when the sweep counter (`demo_sweep_expired_total`) hasn't ticked in 2+ hours. Both metrics are already emitted; this just adds the alert side.
**Why:** Without it, the first sign of a runaway demo cost is the demo turning into "capped" mode for users; the first sign of a stuck sweep is days-stale anonymous data lingering past the 24h promise. Slack pings give an early warning.
**Why deferred:** User explicitly skipped during v0.5.0.0 item 6 — no Slack workspace yet.
**Effort:** S (human: ~1 hour / CC: ~15 min)
**Priority:** P3

---

### Worker language detection threading
**What:** `services/worker.py::_maybe_write_demo_teaser` and the `demo_pipeline_completed` PostHog event currently pass `language=None` (treated as English). Whisper actually returns a detected language — surface it from the transcription call through to the teaser compute and the analytics event.
**Why:** The teaser safety filter SKIPS non-English entries entirely. Right now we treat every demo as English, which means a Spanish/Mandarin recording will get a stem extracted and possibly surfaced in the teaser card.
**Effort:** XS (human: ~20 min / CC: ~10 min) — the hook in worker.py is already documented inline; just thread the value.
**Priority:** P3

---

### Expand teaser allowlist + blocklist
**What:** `services/teaser_allowlist.txt` is 1555 hand-curated journaling lemmas (TODO marker says expand to top-5k common English lemmas). `services/teaser_blocklist.txt` is 840 entries (50 profanity + 400 first names; TODO says expand to 1000 first names from a public-domain census source).
**Why:** Smaller-but-real lists were the right v1 call but the curated lemma list will let through proper-noun-y stems and the small first-name list will leak common names as teaser stems.
**Effort:** S (human: ~1 hour to source + lint / CC: ~20 min)
**Priority:** P3

---

### Single-entry GET endpoint for /welcome
**What:** Add `GET /api/v1/entries/{id}` that returns one entry by id (auth required). `/welcome` currently calls `entriesApi.list(0, 5)` then filters for the just-claimed `entry_ids[0]` — fetches 4 unused entries and parses extra JSON.
**Why:** Low impact (`/welcome` is a low-volume page) but the indirection is silly once anyone notices it.
**Effort:** XS (human: ~30 min / CC: ~10 min)
**Priority:** P3

---

### Frontend leaf-component isolated tests
**What:** `MicButton`, `TurnstileWidget`, `DebriefStrip`, `TrySayingChips`, `TeaserCard` are all covered indirectly via `LandingPage.test.tsx` integration tests. Each is small (under 200 LOC) but isolated component tests would tighten regression detection — e.g. MicButton's 5 anti-slop visual states are easier to assert at the component level than via the page.
**Why:** Surfaced in v0.5.0.0 ship coverage audit. Not blocking — integration coverage is solid — but the leaf components are visible and might evolve quickly.
**Effort:** S (human: ~2 hours / CC: ~30 min for all 5)
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

### ~~Record-First Mobile Landing Flow~~ — v0.5.0.0 (2026-04-24)
Shipped as the interaction-first landing. Visitor taps mic on `/`, records anonymously, gets a real debrief back, then sees Save With Google in the footer. Anonymous entries live in `entries`/`jobs` with nullable `user_id` + `demo_session_id` + 24h `expires_at` (Alembic q6r7s8t9u0v1). Worker reuses the existing pipeline for both authed and anonymous jobs. Daily OpenAI cost cap + 3 SlowAPI rate limits + Cloudflare Turnstile. Save merges via `POST /api/v1/entries/claim-demo-session` (HMAC-signed claim_token threaded through OAuth state). New `/welcome` post-OAuth handoff. Anonymous flywheel: 2nd recording surfaces a teaser stem (Porter + allowlist + blocklist + lang guard).

### ~~Landing CTA Click Analytics~~ — v0.5.0.0 (2026-04-24)
PostHog wired across landing, /welcome, and AuthFooter. Client emits `landing_viewed`, `mic_tapped`, `recording_started/completed`, `debrief_shown`, `teaser_shown`, `save_clicked` (with `method: "google"|"magic_link"`), `signup_completed`, `demo_claim_succeeded|missing|failed`, `cookie_blocked`. Server emits `demo_turnstile_verified`, `demo_submit{outcome}`, `demo_pipeline_completed`, `demo_claim`. Both join on `demo_session_id`. Lazy-init keeps zero overhead when `REACT_APP_POSTHOG_KEY` is unset or in test mode. Prometheus `/metrics` endpoint also exposes funnel + cost + latency counters.

### ~~Presigned URL Content-Type Validation~~ — v0.5.0.0 (2026-04-24)
`POST /v1/public/demo/presign` validates `content_type` against `{audio/webm, audio/mp4, audio/m4a, audio/mpeg}` and rejects anything else with HTTP 400. iOS Safari `audio/mp4` recording supported alongside Chrome/Firefox `audio/webm`. The authed `/captures` presign path predates this PR and is out of scope; the anonymous path is now hardened.

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
