# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0.0] - 2026-03-26

### Added
- Two-phase upload flow: presign → submit with background job processing
- Multi-entry classification: one voice note can produce multiple categorized entries (TODO, IDEA, THOUGHT, TIME_RECORD)
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
