# Changelog

All notable changes to this project will be documented in this file.

## [0.4.1.1] - 2026-04-23

### Changed
- **Landing hero simplified to a single primary CTA.** "Sign in with Google to start" is now the one visually dominant action, with a lightweight "or get a magic link" text link below for users without a Google account. The previous side-by-side Google + "Start your debrief" layout competed for attention on mobile and fragmented the funnel. Rationale: Google is a 1-tap path; magic link is a 4-step tab-switching flow, so the default should be the fastest — magic link stays reachable as a text alternative for the Google-less.
- **Pre-auth NavBar stripped down.** Unauthenticated users now see logo + a single "Sign in" text link. The competing Google / Sign In / Sign Up trio was removed — the hero owns the primary action; the nav is a quiet escape hatch.
- **Landing tightened overall.** Shorter subhead ("Talk. We turn it into your weekly brief."), 8px-rhythm spacing between hero elements (title→sub 16px, sub→CTA 24–32px, hero→demo 48–64px), stronger card borders on marketing surfaces using `text-muted` instead of `rule`, 20px demo checkboxes (vs. 16px in-app) for visible touch affordance, bolder card-header overlines, and a 3px AI Coach left border (vs. 2px in-app).
- **`GoogleSignInButton` accepts an optional `label` prop** so the landing hero can use "Sign in with Google to start" while other surfaces keep the default "Sign in with Google".

### Docs
- **DESIGN.md gains a "Landing / Marketing Surface" section** codifying CTA-hierarchy rules, unauth NavBar spec, landing-specific spacing tokens, and the text-muted border / heavier coach-border overrides for marketing surfaces. Four new Decisions Log entries anchor today's choices with rationale so future changes have a spec to read against.

## [0.4.1.0] - 2026-04-23

### Security
- **Backend dependency bumps to close Dependabot CVEs.** `python-jose` 3.3.0 → 3.4.0 (critical: OpenSSH ECDSA algorithm confusion), `python-multipart` 0.0.6 → 0.0.20 (high: arbitrary file write, Content-Type ReDoS, multipart DoS), `PyJWT` 2.8.0 → 2.12.1 (high: unknown `crit` header extensions), `requests` 2.31.0 → 2.33.1 (netrc credentials leak, `verify=False` session reuse, insecure temp file), `python-dotenv` 1.0.0 → 1.2.2 (`set_key` symlink follow). All 161 backend tests pass on the bumped versions.
- **Frontend dependency bumps.** `axios` ^1.6.5 → ^1.15.2 (high: SSRF via absolute URL, DoS via `__proto__` in mergeConfig, header-injection cloud-metadata exfiltration, NO_PROXY bypass SSRF), `react-router-dom` ^6.21.3 → ^6.30.3 (high: XSS via open redirect in `@remix-run/router`, unexpected external redirect in `react-router`). Transitively pulls in `form-data` 4.0.5 (critical: unsafe random boundary) and `follow-redirects` 1.16.0 (auth header leak on cross-domain redirect). Production build succeeds; bundle size +390 B gzipped.
- **Remaining alerts** (~45) are all CRA/`react-scripts@5.0.1` dev/test-only transitives (`minimatch`, `node-forge`, `lodash`, `svgo`, `webpack-dev-server`, etc.) that don't ship to users. Will be resolved by a future CRA→Vite migration.

## [0.4.0.0] - 2026-04-23

### Added
- **Passwordless email magic-link sign-in.** New unified `SignInForm` replaces the old Login/Register forms. Enter email → click the link in the inbox → you're in. No password is ever set. Supabase's `signInWithOtp` with `shouldCreateUser: true` handles both new and returning users; clicking the link redirects back via `emailRedirectTo: window.location.origin` and `onAuthStateChange` picks up the session. 30-second resend cooldown with live countdown, "wrong email?" back link, reducer-backed state machine (`step`, `status`, `resendCooldown`).
- **Google Sign-In on the landing hero.** New shared `GoogleSignInButton` component (Google brand spec — white bg, `#DADCE0` border, blue G logo, `#3C4043` text) rendered side-by-side with "Start your debrief" on the landing page, and again inside the sign-in form above the email input. Users can sign in with one click without visiting `/login`.
- **Week-arc landing demo.** Replaced the daily audit demo with a two-column showcase of the product's pattern-detection value: Open Loops (TODOs rolling across days) + Recurring Themes + AI Coach quote. Mobile stacks Open Loops first, Themes second.
- **Unified auth error mapping** via `mapAuthError(err)` exported from `AuthContext` — single source of truth for user-facing copy across sign-in, resend, Google OAuth, and 401 refresh paths. Covers expired codes, wrong codes, rate limits, network failures, invalid emails, and generic fallback.
- **New test coverage.** `SignInForm.test.tsx` (10 cases), `LandingPage.test.tsx` (7 cases), `AuthContext.test.tsx` (8 `mapAuthError` cases), `interceptor.test.ts` (6 cases for Bearer token attach, public path skip, near-expiry refresh, no-session handling, 401 refresh+retry, signOut on refresh failure). 84 tests pass across 10 suites.

### Changed
- **Axios interceptor switched to Supabase session** (`frontend/src/services/api.ts`). Reads the Supabase access token synchronously from `localStorage` on every request (avoids `supabase-js` storage-lock hangs), refreshes slightly before expiry via a 30-second skew margin, and caps `refreshSession()` at 5 seconds via `Promise.race` so a wedged refresh can't hang a request. Preserves the concurrent-401 queue so N simultaneous 401s trigger one refresh and N retries. On unrecoverable refresh failure, signs out cleanly via `supabase.auth.signOut()` — no more indefinite spinners.
- **`AuthContext.tsx` is now Supabase-only.** Dropped the JWT fallback branch and the `useSupabase` flag. `register()` and `login()` removed from the context interface. Exposed new `sendOTP(email)` and `verifyOTP(email, token)` hooks; `loginWithGoogle()`, `logout()`, and `refreshAccessToken()` remain.
- **Routing.** `/register` now redirects to `/login` (preserves old email/bookmark links). `/login` renders the new `SignInForm`. `NavBar` drops the `useSupabase` conditional — the Google button is always shown.
- **`CLAUDE.md` auth section rewritten** to describe the Supabase OTP + Google flow. Legacy JWT endpoints are marked as orphaned with a pointer to the backend-cleanup TODO.

### Removed
- `frontend/src/services/auth.ts` — JWT-token service class, no longer needed after the Supabase-only migration.
- `frontend/src/components/auth/LoginForm.tsx` and `frontend/src/components/auth/RegisterForm.tsx` — replaced by `SignInForm`.
- `frontend/src/pages/Login.tsx` and `frontend/src/pages/Register.tsx` — dead code (not imported anywhere).
- `LoginCredentials`, `RegisterCredentials`, `AuthResponse`, `TokenData` from `frontend/src/types/auth.ts` — unused after the JWT removal. `User` remains.

### Design
- Landing page, sign-in form, and Google button fully align to `DESIGN.md` tokens (warm cream `#F5EDE0`, vermilion `#B6492D`, hairline `#C4B8A8`, 8px scale, no shadows, DM Serif Display h1/h2, DM Sans body). OTP input uses `JetBrains Mono` with `0.4em` letter-spacing and a `• • • • • •` placeholder. Full design spec lives in [`docs/designs/landing-auth-redesign.md`](docs/designs/landing-auth-redesign.md).
- Responsive: hero CTA row stacks on mobile (Google on top), two-column demo collapses to single-column on `<900px`.
- Accessibility: `autoFocus` on each step, `aria-live="polite"` on OTP errors and resend cooldown, `aria-describedby` linking OTP input to the helper text, `inputMode="numeric"` + `autoComplete="one-time-code"`, all touch targets ≥44px.

### Operational pre-launch checklist
Before merging, verify in the Supabase dashboard:
- Auth > Providers > Email > "Email OTP" enabled.
- Auth > Providers > Google > client ID/secret configured (already set in v0.2.0.0).
- Auth > Settings > **"Link accounts with same email" enabled** — without this, a user who signs up via OTP then signs in with Google using the same email creates a duplicate account.
- Email OTP template customized to match the editorial tone.
- `REACT_APP_USE_SUPABASE=true` in Render environment variables (only used to gate the now-removed JWT fallback; safe to unset in a follow-up).

## [0.3.8.0] - 2026-04-19

### Changed
- **Weekly coach letter is now a 4-bullet briefing** instead of 4 paragraphs. Stage-2 prompt produces exactly `- Pattern / - Working / - Not working / - Next`, each one sentence, in the same language as the Stage-1 analysis. Frontend `CoachLetter` auto-detects bullets (`- ` or `* ` at line start, 2+ occurrences) and renders `<ul>`; paragraph format still renders for cached older reports (back-compat).
- **Validator swapped from paragraph-count to bullet-count.** `_check_weekly_letter` requires exactly 4 bullets, still runs the uncomfortable_truth + next_week_action fuzzy containment checks at letter scope, and now applies the per-block CJK/Latin language-lock check against bullets (not paragraphs). Rewrite-once loop unchanged.
- **`/week` quote-card typography aligned to DESIGN.md.** Both the Recurring Themes teaser and the Thought Gems preview dropped `DM Serif Display` italic + responsive 1.15–1.3rem sizing + decorative `\u201C` glyph. Now DM Sans italic, 15px (body1), weight 400, `lineHeight: 1.7`, with a 3px left accent bar whose color carries the card's voice (polarity for themes, `accentSoft` for gems).
- **Recurring theme `description` hard-truncated to 140 characters** at both the insert and update persist branches in `generate_weekly_audit`. Long LLM outputs no longer blow up the themes card's vertical height. Prompt already asks for THEME (≤4 words) + one-sentence description; truncate is the server-side backstop.

### Refactored
- `_paragraph_dominant_lock_violations` → `_block_dominant_lock_violations(blocks, lock, block_name="paragraph")`. Same per-block dominant-script thresholds (CJK > 40% flags `en` lock; Latin > 60% flags `zh` lock); caller passes `block_name` so error messages say `paragraph N` or `bullet N` as appropriate. Default argument preserves prior error strings for callers that still pass paragraphs.

## [0.3.7.0] - 2026-04-18

### Added
- **Per-user coaching preferences** (`personality.md` v1): tone (warm/direct/playful), pacing (actionable/reflective/both), language lock (auto/zh/en), and up to 10 avoid-topics steer the weekly audit prompt. Stored in a new `users.coaching_preferences` JSONB column (Alembic migration `p5q6r7s8t9u0`); NULL = defaults, no backfill.
- `GET` / `PATCH /api/v1/users/me/preferences` with strict write validation (NFKC normalize, zero-width strip, prompt-injection blocklist for EN+ZH, 60-char per-topic / 10-topic caps) and forgiving read normalization (unknown enums fall back to per-field defaults; malformed top-level shape falls back to full defaults). PATCH semantics: omit a field to keep, set `null` to reset, send a value to override.
- `/settings` page on the web app with tone/pacing/language selectors, chip-based avoid-topics editor (Enter-to-add, case-insensitive dedup), per-field 422 helper text, and a Reset-to-defaults button. Reachable from the avatar menu.
- `prefs_stale` banner on `/week`: when the cached weekly report was generated under an older version of your preferences, the page surfaces an inline alert with a Regenerate button and a deep link to `/settings`.
- **Recent-change signals** service (`weekly_signals.py`) deriving `emerging` / `fading` / `new_friction` theme buckets relative to the report's `week_start` (not today, so historical regenerates stay stable). Fed into the prompt so the weekly letter can name what's actually changing.
- Server-side `applied_prefs` echo in the analysis JSON — what the LLM was told to apply, surfaced for verification and future "what does it know about me?" UIs.

### Changed
- Weekly audit prompt (Stage-1 + Stage-2) now injects `USER COACHING PREFERENCES` and recent-change signals when personalization is on. Language lock, when set to `zh` or `en`, hard-overrides Stage-2 language detection. Avoid-topics downgrade prescriptive advice to a single open question; naming as a category fact is still allowed.
- `AuditResponse` includes `prefs_stale: bool` (default `false`).

### Operations
- New env var `COACHING_PERSONALIZATION_ENABLED` (default `true`) — kill-switch read at call-time so tests can monkeypatch. When off, the weekly prompt skips the prefs and signals blocks.

## [0.3.6.0] - 2026-04-16

### Added
- **Closed this week** on the weekly report: resolved TODOs from the selected week render as strikethrough rows with an undo button, giving users a visible sense of progress alongside open loops.
- `resolved_at` timestamp on captures (new Alembic migration `o4p5q6r7s8t9`): stamped when a capture transitions out of `open` and cleared on reopen. Backfilled from `classified_at` for existing non-open rows so historical captures light up the "Closed this week" section immediately.
- Dedicated `/themes` subpage showing the full recurring-themes list (polarity dot, title, description, occurrence count, dismiss button) with a back link to `/week`.

### Changed
- Weekly report's Recurring Themes shrunk to a hero teaser: one pulled quote from the top theme plus "+N more threads" linking to `/themes`. Frees screen real estate without hiding the signal.
- Thought Gems card now previews the top reflection from the selected week as a DM Serif Display pulled quote with opening quote mark and footer count, replacing the generic label. Still deep-links to `/thoughts?week_start=<week>`.
- `PATCH /api/v1/captures/{id}` stamps `resolved_at` on status transition out of `open` and clears it on reopen; `CaptureItem` response now includes `resolved_at`.

## [0.3.5.1] - 2026-04-16

### Fixed
- Weekly report header keeps the Generate/Regenerate action aligned with the week selector on mobile, with constrained text overflow and a 44px touch target.

## [0.3.5.0] - 2026-04-16

### Added
- `/thoughts` page ("Thought Garden v1"): a weekly view of REFLECTION captures. Shows this week's reflections as "Gems" and prior 3 weeks grouped as "Recent Reflections". Each row links back to its source day.
- `?week_start=YYYY-MM-DD` URL param on `/thoughts` for deep-linking any Monday's week. Invalid values are silently stripped and fall back to the current Monday.
- Compact "Thought Gems" card on `/week` that links into `/thoughts?week_start=<selectedWeek>` so the weekly review loop surfaces the reflection archive for the week you're reading.

## [0.3.4.0] - 2026-04-16

### Fixed
- Weekly reports now show the full multi-paragraph AI coach letter instead of only the short draft status update.
- Weekly report rendering preserves paragraph breaks and still falls back to the draft status update when no coach letter is available.

## [0.3.3.0] - 2026-04-16

### Added
- Two-stage LLM pipeline for weekly reports with dedicated thinking (analysis) and writing (letter) stages
- Lightweight validator stage checks the weekly letter for paragraph structure, required content, and groundedness against the analysis JSON; rewrites once if checks fail
- Internal scoring rubric in Stage 1 (EARNING/LEARNING/RELAXING/FAMILY daily scoring, balance variance) and theme reuse rules (max 3 themes)

### Changed
- Stage 1 (thinking) uses `gpt-5.4` at temp 0.3 for sharper analysis
- Stage 2 (writing) uses `gpt-5.4-mini` at temp 0.6 with explicit structure/style rules (4 paragraphs, plain language, mandatory content)
- Weekly letter no longer enforces a 400-word cap; model is trusted to use the length the week warrants

### Removed
- Past Weeks navigation pages and `GET /audit/weekly/history` endpoint now that the week selector dropdown replaces them

## [0.3.2.0] - 2026-04-15

### Added
- Week selector dropdown on `/week` page lets you navigate to any past week with 3+ entries
- New `GET /audit/weekly/available-weeks` endpoint returns qualifying weeks with entry counts
- Weekly reports auto-generate on page load (lazy generation) instead of requiring manual click

### Changed
- `GET /audit/weekly` and `POST /audit/weekly` now accept `week_start` parameter to target any week
- Weekly audit cache invalidation covers both daily and weekly keys when entries change

### Fixed
- `date_trunc` result cast to Date for reliable `has_report` join in available-weeks query

## [0.3.1.0] - 2026-04-13

### Changed
- Day page stripped to pure capture: record button, date nav, entry list. No analysis.
- Week page redesigned as scannable insight view: key insight at top, category breakdown, recurring themes, open loops.
- Per-line tap-to-edit replaces modal editing. Tap any classification line to edit inline.
- Visible "..." button replaces long-press for entry actions (move, delete, re-classify). 44px touch targets.
- Past weekly reviews moved to dedicated `/weeks` page with drill-down detail.
- Weekly audit cache now keyed by Monday (week_start) instead of today, preventing duplicate rows across the same week.

### Fixed
- Moving an entry to a new date now updates `local_date` (not just `created_at`), so the Day page shows the entry on the correct day.
- Both source and target day audit caches are invalidated when moving an entry.
- GET `/audit/weekly` now uses `week_start` cache key, matching the POST endpoint.
- Stale `selectedDate` closure in recording upload callback.
- Save error feedback: failed edits and moves now show a snackbar instead of failing silently.
- Date picker for move-to-date uses `local_date` instead of `created_at`.

## [0.3.0.0] - 2026-04-10

### Added
- **Past record search** — dedicated `/search` page to find old entries by transcript text, classification line, or category metadata. Infinite scroll, highlighted matches, and chips explaining why each result matched.
- **Nav bar search input** — type a query from anywhere in the app and jump straight to filtered results.
- **Deep-linkable day view** — `/?date=YYYY-MM-DD` opens the recording page pinned to that day. Search results link back to the exact day each entry belongs to.
- Filter search by category and date range.
- Backend `GET /api/v1/entries/search` endpoint with case-insensitive matching, match-source provenance, and result pagination.

### Fixed
- Escape LIKE special characters (`%`, `_`) in the search endpoint so a user-entered `%` behaves as a literal, not a wildcard.
- Reject search queries shorter than 2 characters *after* trimming whitespace.
- Cap search query length at 200 characters so oversized queries can't pin DB CPU.
- Reject malformed or future-dated `?date=` URL parameters before they reach the upload payload.
- Match-source provenance now correctly reports classification-line matches against both original and edited text.

## [0.2.0.0] - 2026-03-26

### Added
- Two-phase upload flow: presign → submit with background job processing
- Multi-entry classification: one voice note can produce multiple categorized entries (TODO, EXPERIMENT, REFLECTION, TIME_RECORD)
- Daily and weekly AI-powered audit endpoints with cache persistence
- Supabase Auth integration (Google OAuth, email/password) alongside legacy JWT auth
- Supabase Realtime notifications for entry processing status
- Transcript refinement via LLM post-processing
- Design system (DESIGN.md) with dark theme, Inter/JetBrains Mono typography
- LandingPage with feature overview and auth forms
- EntryCard component with per-classification inline editing
- Date-filtered entry listing ("Today's Entries" actually scopes to today)
- Auth loading state prevents flash redirect on Supabase hard refresh
- CategoryItem Pydantic validators (category allowlist, estimated_minutes bounds 0-1440)
- Category allowlist filter on LLM output in categorization service
- Weekly audit `regenerate` parameter to bypass stale cache
- New test suites: categorization service, worker multi-entry, entry validators

### Changed
- Migrated from single-category to multi-classification data model (EntryClassification table)
- Replaced synchronous audio upload with async presign + background worker pipeline
- Frontend state management: Redux → React Query + AuthContext
- RecordButton simplified to presign-upload flow (removed in-browser recording state)
- Supabase users now resolve real DB user ID for accurate realtime subscriptions
- SQLAlchemy boolean comparisons use `.is_(False)` for NULL safety
- Worker model_version updated to gpt-5.4-nano

### Removed
- Legacy routes: /api/audio, /api/categories, /api/auth (replaced by /api/v1/)
- Legacy models: Audio, CustomCategory, Gamification
- Legacy frontend: CategorizedContent, ContentCard, DraggableItem, DroppableContainer, Redux store
- WebSocket endpoint (replaced by Supabase Realtime)
- Old test files referencing removed models

### Fixed
- CSP blocks Google Fonts (added fonts.googleapis.com and fonts.gstatic.com)
- Raw status code shown on login error (now user-friendly message)
- Build errors from unused dependencies and ESLint issues
- Worker unit tests: enum casing, stale mock targets for removed modules
