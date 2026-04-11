# Changelog

All notable changes to this project will be documented in this file.

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
