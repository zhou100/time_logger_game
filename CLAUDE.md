# CLAUDE.md — Time Logger Game

This file provides guidance for AI assistants (Claude and others) working on this codebase.

---

## Project Overview

**Time Logger Game** is a full-stack web application for voice-based time tracking with AI-powered categorization. Users record voice notes, which are transcribed via OpenAI Whisper and auto-categorized (TODO, IDEA, THOUGHT, TIME_RECORD) using GPT-4o-mini. Features include daily/weekly AI coach audits and time-weighted category breakdowns.

---

## Repository Structure

```
time_logger_game/
├── backend/                  # FastAPI Python backend
│   ├── app/
│   │   ├── main.py           # FastAPI app entry point, router registration
│   │   ├── db.py             # Async DB engine, session factory, init_db
│   │   ├── settings.py       # App configuration (JWT, DB URLs, ports)
│   │   ├── dependencies.py   # Shared FastAPI dependencies
│   │   ├── core/
│   │   │   ├── auth.py       # Auth logic
│   │   │   └── security.py   # JWT creation/validation, bcrypt hashing
│   │   ├── models/           # SQLAlchemy ORM models
│   │   │   ├── base.py
│   │   │   ├── user.py
│   │   │   ├── audio.py
│   │   │   ├── categories.py
│   │   │   └── demo.py       # DemoCostCounter, DemoRequestLog, DemoOutcome constants
│   │   ├── routes/           # Active FastAPI routers (use these, not routers/)
│   │   │   ├── auth.py       # /api/auth — register, login, token refresh
│   │   │   ├── audio.py      # /api/audio — upload, transcribe, list
│   │   │   ├── categories.py # /api/categories — CRUD for categories
│   │   │   ├── public_demo.py # /v1/public/demo — anonymous landing pipeline (v0.5.0.0)
│   │   │   ├── users.py
│   │   │   └── v1/claim.py   # /api/v1/entries/claim-demo-session
│   │   ├── routers/          # LEGACY — do not add new routes here
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── services/         # Business logic
│   │   │   ├── audio.py      # Whisper transcription
│   │   │   ├── categorization.py  # GPT-4o-mini categorization
│   │   │   ├── analytics.py  # PostHog client (lazy-init)
│   │   │   ├── metrics.py    # Prometheus instruments + /metrics endpoint
│   │   │   ├── demo_tokens.py # HMAC permit_token + claim_token
│   │   │   ├── demo_ip.py    # CF-Connecting-IP extraction + hashed salt
│   │   │   ├── demo_pricing.py # Whisper + GPT-4o-mini cost helpers
│   │   │   ├── demo_sweep.py # Hourly TTL sweep + S3 batch delete + rate-limit GC
│   │   │   ├── teaser.py     # Anonymous flywheel pattern detection
│   │   │   ├── _porter.py    # Vendored Porter stemmer
│   │   │   └── teaser_{allow,block}list.txt # Curated wordlists
│   │   └── utils/            # Auth helpers, misc utilities
│   ├── alembic/              # DB migration management
│   │   └── versions/         # Migration scripts
│   ├── tests/                # pytest test suite (18+ files)
│   │   ├── conftest.py       # Fixtures: test DB, app, async client
│   │   ├── e2e/
│   │   └── isolated_test/
│   ├── scripts/
│   │   └── start.py          # Docker entrypoint: wait for DB → migrate → serve
│   ├── alembic.ini
│   ├── pytest.ini
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                 # React + TypeScript frontend
│   ├── src/
│   │   ├── App.tsx           # Root component, routing setup
│   │   ├── index.tsx         # React entry point
│   │   ├── components/       # Reusable UI components
│   │   │   ├── auth/         # SignInForm (email OTP), GoogleSignInButton, ProtectedRoute
│   │   │   └── landing/      # MicButton, TrySayingChips, DebriefStrip, TurnstileWidget, AuthFooter, TeaserCard
│   │   ├── pages/
│   │   │   ├── RecordingPage.tsx  # Main app page
│   │   │   ├── LandingPage.tsx    # Interaction-first landing (v0.5.0.0)
│   │   │   ├── WelcomePage.tsx    # Post-OAuth save handoff (v0.5.0.0)
│   │   │   └── PrivacyPage.tsx    # 24h retention disclosure (v0.5.0.0)
│   │   ├── hooks/
│   │   │   └── useDemoRecording.ts # MediaRecorder → presign → submit → status state machine
│   │   ├── services/
│   │   │   ├── api.ts        # Axios client; Supabase session + auto refresh + 401 queue
│   │   │   ├── demoApi.ts    # Public demo client (no auth, withCredentials)
│   │   │   ├── analytics.ts  # PostHog client (lazy-init)
│   │   │   ├── supabase.ts   # Supabase client singleton
│   │   │   └── supabaseStorage.ts  # Synchronous session read (no storage-lock hangs)
│   │   ├── store/            # Redux store + contentSlice
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx
│   │   ├── types/            # TypeScript type definitions
│   │   └── theme.ts          # Material-UI theme
│   ├── cypress/              # Cypress E2E tests
│   ├── nginx/nginx.conf      # Production Nginx config
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile            # Multi-stage: Node builder + Nginx runtime
├── .github/workflows/
│   └── deploy.yml            # CI/CD pipeline (GitHub Actions)
├── docker-compose.yml        # Multi-service dev environment
├── render.yaml               # Render.com deployment config
└── README.md
```

---

## Tech Stack

### Backend
| Technology | Version | Purpose |
|---|---|---|
| FastAPI | 0.104.1 | Web framework |
| SQLAlchemy | 2.0.23 | Async ORM |
| Alembic | 1.12.1 | DB migrations |
| PostgreSQL | 15 | Database (via asyncpg) |
| OpenAI SDK | 1.3.7 | Whisper (transcription) + GPT-4o-mini (categorization) |
| python-jose / PyJWT | latest | JWT auth |
| passlib[bcrypt] | latest | Password hashing |
| slowapi | 0.1.8 | Rate limiting |
| pydub | 0.25.1 | Audio processing |
| pytest + pytest-asyncio | 7.4.3 | Testing |

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 18.2.0 | UI framework |
| TypeScript | latest | Type safety |
| Material-UI | latest | Component library |
| Redux Toolkit | latest | State management |
| Axios | 1.15.2 | HTTP client |
| react-router-dom | 6.30.3 | Routing |
| react-media-recorder | 1.7.1 | Browser audio recording |
| react-beautiful-dnd | 13.1.1 | Drag-and-drop |
| Cypress | 13.6.3 | E2E testing |

---

## Environment Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL 15 (or Docker)
- OpenAI API key

### Local Development (Docker — recommended)

```bash
# Copy env vars (edit as needed)
cp backend/.env.test backend/.env

# Start all services
docker-compose up --build

# Backend available at: http://localhost:10000
# Frontend available at: http://localhost:3000
```

### Local Development (without Docker)

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.test .env  # edit DATABASE_URL and OPENAI_API_KEY
alembic upgrade head
uvicorn app.main:app --reload --port 10000

# Frontend (separate terminal)
cd frontend
npm install
npm start  # runs on port 3000
```

### Required Environment Variables

```bash
# Backend (.env)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/time_logger_game
SECRET_KEY=<your-secret-key>
OPENAI_API_KEY=<your-openai-key>
ACCESS_TOKEN_EXPIRE_MINUTES=240
ALGORITHM=HS256
ENVIRONMENT=development
LOG_LEVEL=INFO
```

---

## Development Workflows

### Running Tests

```bash
# Backend unit + integration tests
cd backend
pytest                         # all tests
pytest tests/test_auth.py      # single file
pytest -m unit                 # by marker
pytest -m "not slow"           # exclude slow tests

# Frontend E2E tests (requires running app)
cd frontend
npx cypress open               # interactive
npx cypress run                # headless
```

### Database Migrations

```bash
cd backend

# Create a new migration after model changes
alembic revision --autogenerate -m "describe your change"

# Apply all pending migrations
alembic upgrade head

# Roll back one migration
alembic downgrade -1

# Check current state
alembic current
```

**Important**: Always run `alembic upgrade head` after pulling changes that include new migration files.

### Adding a New API Endpoint

1. Add the route in `backend/app/routes/<relevant_file>.py`
2. Add Pydantic schemas to `backend/app/schemas/`
3. Add business logic to `backend/app/services/`
4. Register the router in `backend/app/main.py` if it's a new router file
5. Add corresponding tests in `backend/tests/`
6. Update TypeScript types in `frontend/src/types/`
7. Add API call in `frontend/src/services/api.ts`

---

## Key Conventions

### Backend

- **Use `routes/` not `routers/`**: The `backend/app/routers/` directory is legacy. All new routes go in `backend/app/routes/`.
- **Async everywhere**: All database operations must use `async/await`. Use `AsyncSession` from `db.py`.
- **Dependency injection**: Use `Depends(get_current_user)` to protect endpoints. See `utils/auth.py`.
- **Pydantic v2**: Models use `model_config = ConfigDict(from_attributes=True)` instead of `class Config`.
- **JWT tokens**: Access tokens expire in 240 minutes; refresh tokens in 30 days. See `settings.py`.
- **Category types**: The `ContentCategory` enum values are `TODO`, `IDEA`, `QUESTION`, `REMINDER`.
- **Error handling**: Raise `HTTPException` with appropriate status codes. 401 for auth errors, 404 for not found, 422 for validation.
- **Logging**: Use `logging.getLogger(__name__)` — config is in `backend/app/config/logging_config.py`.

### Frontend

- **Auth flow**: Tokens stored in `localStorage`. The Axios interceptor in `services/api.ts` auto-refreshes on 401.
- **Protected routes**: Wrap with `<ProtectedRoute>` — it reads from `AuthContext`.
- **State**: Use Redux for content/audio state. Use `AuthContext` for user/auth state (not Redux).
- **API calls**: Always go through `services/api.ts` — never call `fetch` directly. The axios instance handles auth headers and token refresh.
- **TypeScript**: All new components must be typed. Add types to `types/api.ts` or `types/auth.ts`.
- **Material-UI**: Use MUI components and the theme from `theme.ts` — avoid inline styles.

### Database

- **Primary DB**: `time_logger_game` on port 5432 (Docker: `db` service)
- **Test DB**: `time_logger_test` on port 5433 — separate instance to avoid test pollution
- **ORM models** are in `backend/app/models/`. Always update Alembic migrations when changing models.
- **Test fixtures** in `conftest.py` drop and recreate all tables before each test session.

---

## API Overview

### Base URL
- Local: `http://localhost:10000`
- Production: configured via `render.yaml`

### Authentication
Auth is handled by **Supabase Auth** (passwordless email OTP + Google OAuth).
The frontend calls the Supabase client directly — it does not hit backend auth routes.
Backend validates the Supabase JWT on every protected request.

Legacy JWT endpoints (`/api/auth/register`, `/api/auth/token`, `/api/auth/refresh`) still
exist on the backend but are orphaned post-Supabase migration. Scheduled for removal —
see TODOS.md "Backend JWT Auth Endpoint Cleanup".

### Audio Endpoints (`/api`)
| Method | Path | Description |
|---|---|---|
| POST | `/api/audio/upload` | Upload audio → transcribe (Whisper) → categorize (GPT-4o-mini) |
| GET | `/api/audio` | Get paginated user audio entries |

### Category Endpoints (`/api`)
| Method | Path | Description |
|---|---|---|
| GET | `/api/categories` | List all categories (standard + custom) |
| POST | `/api/categories/custom` | Create custom category |

### Anonymous Demo Endpoints (`/v1/public/demo`)
Public, no auth. Gated on `PUBLIC_DEMO_ENABLED` (false → all return 404).

| Method | Path | Description |
|---|---|---|
| POST | `/v1/public/demo/verify-turnstile` | Cloudflare Turnstile siteverify → issue HMAC permit_token + set HttpOnly `tlg_demo_sid` cookie |
| POST | `/v1/public/demo/presign` | Validate permit + cookie → create anonymous Entry placeholder → return S3 presigned PUT + claim_token |
| POST | `/v1/public/demo/submit` | Validate permit + cookie → cost-cap check → enqueue Job (no inline Whisper). Returns `{entry_id, job_id}` or `{demo:"capped", fake_output}` |
| GET | `/v1/public/demo/status/{entry_id}` | Cookie-gated polling. Returns `{step, transcript, classifications, summary, demo_teaser}` with mechanical summary derived at read-time |

### Save-on-signup
| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/entries/claim-demo-session` | Auth required. Body `{claim_token}`. Idempotent single-tx UPDATE flipping `user_id` on `entries`/`jobs` for the session |

### Utility
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus exposition (no auth, scrape contract) |

---

## Architecture Notes

### Audio Processing Pipeline
```
User records audio (browser Web Audio API)
    ↓ POST /api/audio/upload (multipart form data)
Backend saves temp file
    ↓ OpenAI Whisper API
Transcribed text returned
    ↓ GPT-4o-mini with system prompt
Categorized as TODO / IDEA / QUESTION / REMINDER
    ↓ Saved to PostgreSQL (audio + categorized_entries tables)
Frontend displays categorized entry
```

### Authentication Flow
```
Landing page:
  [Sign in with Google to start]  ──→ Supabase OAuth ──→ app   (primary CTA)
  "or get a magic link" (text link) ──→ /login (SignInForm)    (secondary)
                                │
                          Email entry → signInWithOtp (shouldCreateUser: true,
                                        emailRedirectTo: origin)
                                │
                          "Check your inbox" confirmation page
                                │
                          User clicks magic link in email → Supabase redirects
                          back to app with session token in URL fragment
                                │
                          supabase-js parses fragment → onAuthStateChange fires
                          SIGNED_IN → AuthContext sets user → app

Supabase session stored in localStorage (standard supabase-js behavior).
Axios interceptor (services/api.ts) reads the session synchronously and
attaches a Bearer token. On 401: refreshSession() with a 5s timeout and a
concurrent-401 queue; on refresh failure → signOut → redirect to /login.

No password is ever set. Users authenticate with Google (one click) or
email magic link (one field → click link in inbox).
```

### Data Models
```
User (id, email, hashed_password, is_active)
  └── Audio (id, user_id, transcribed_text, filename, audio_path, created_at)
        └── CategorizedEntry (id, audio_id, user_id, text, category, custom_category_id)
  └── CustomCategory (id, user_id, name, color, icon)
```

---

## Common Pitfalls

1. **Don't use synchronous SQLAlchemy** — this app uses `asyncpg` and `AsyncSession`. All DB calls must be `await`ed.
2. **CORS** — backend allows `http://localhost:3000` only. Update `main.py` `allow_origins` for other origins.
3. **Alembic sync URL vs async URL** — `alembic.ini` uses the sync `postgresql://` URL (not `postgresql+asyncpg://`). This is intentional for the migration runner.
4. **Test isolation** — tests use a separate DB on port 5433. Don't use the production DB for tests.
5. **OpenAI key required for audio tests** — tests that exercise the full audio pipeline need a real `OPENAI_API_KEY`. Set `OPENAI_API_KEY=dummy_key_for_testing` in `.env.test` to skip those tests.
6. **`routers/` vs `routes/`** — new code goes in `routes/`. The `routers/` directory is legacy and may be removed.
7. **Token expiry in settings** — `ACCESS_TOKEN_EXPIRE_MINUTES=240` (4 hours). Don't set it too short or tests will fail intermittently.

---

## Deployment

### Docker Compose (local/staging)
```bash
docker-compose up --build -d
```

Services:
- `backend`: FastAPI on port 10000, waits for DB, runs migrations on start
- `frontend`: React on port 3000 (dev) or Nginx (prod)
- `db`: PostgreSQL 15 on port 5433 (mapped from internal 5432)

### Render.com (production)
- Configured in `render.yaml`
- Backend deployed as a web service
- Persistent disk at `/app/temp` (1GB) for temporary audio files
- Set `OPENAI_API_KEY`, `SECRET_KEY`, and `DATABASE_URL` as environment variables in Render dashboard

---

## Folder Hygiene

- `archive/` — old/unused code. Do not add new files here; do not delete without checking with team.
- `scratchpad.md`, `planner.log`, `feedback.md` — informal notes, not production code.
- `system_design_choice.md` — architectural decision records. Read before making large changes.
- `.windsurfrules` — Windsurf IDE rules (similar to this file for Windsurf).

---

## Design System

Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

---

## Gstack

This project uses [gstack](https://gstack.dev) for web browsing and development workflows.

**Web browsing**: Always use the `/browse` skill for all web browsing. Never use `mcp__claude-in-chrome__*` tools directly.

**Available skills**:

| Skill | Purpose |
|---|---|
| `/browse` | Web browsing (use this instead of mcp__claude-in-chrome__* tools) |
| `/office-hours` | Q&A and guidance session |
| `/plan-ceo-review` | CEO-level plan review |
| `/plan-eng-review` | Engineering plan review |
| `/plan-design-review` | Design plan review |
| `/design-consultation` | Design consultation |
| `/review` | Code review |
| `/ship` | Ship changes |
| `/land-and-deploy` | Land and deploy to production |
| `/canary` | Canary deployment |
| `/benchmark` | Run benchmarks |
| `/qa` | Full QA with browsing |
| `/qa-only` | QA without deploy steps |
| `/design-review` | Visual design review |
| `/setup-browser-cookies` | Set up browser authentication cookies |
| `/setup-deploy` | Set up deployment configuration |
| `/retro` | Retrospective |
| `/investigate` | Investigate an issue |
| `/document-release` | Document a release |
| `/codex` | Codex tasks |
| `/cso` | CSO workflow |
| `/careful` | Careful/cautious mode for risky changes |
| `/freeze` | Freeze deployments |
| `/guard` | Guard / protect a resource |
| `/unfreeze` | Unfreeze deployments |
| `/gstack-upgrade` | Upgrade gstack itself |

**Troubleshooting**: If gstack skills aren't working, rebuild the binary and re-register skills:

```bash
cd .claude/skills/gstack && ./setup
```

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
