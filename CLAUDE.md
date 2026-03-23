# CLAUDE.md — Time Logger Game

This file provides guidance for AI assistants (Claude and others) working on this codebase.

---

## Project Overview

**Time Logger Game** is a full-stack web application for voice-based time tracking with AI-powered categorization. Users record voice notes, which are transcribed via OpenAI Whisper and auto-categorized (TODO, IDEA, QUESTION, REMINDER) using GPT-4o-mini. The "game" aspect includes streaks, points, and badges.

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
│   │   │   └── categories.py
│   │   ├── routes/           # Active FastAPI routers (use these, not routers/)
│   │   │   ├── auth.py       # /api/auth — register, login, token refresh
│   │   │   ├── audio.py      # /api/audio — upload, transcribe, list
│   │   │   ├── categories.py # /api/categories — CRUD for categories
│   │   │   └── users.py
│   │   ├── routers/          # LEGACY — do not add new routes here
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── services/         # Business logic
│   │   │   ├── audio.py      # Whisper transcription
│   │   │   └── categorization.py  # GPT-4o-mini categorization
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
│   │   │   └── auth/         # LoginForm, RegisterForm, ProtectedRoute
│   │   ├── pages/
│   │   │   └── RecordingPage.tsx  # Main app page
│   │   ├── services/
│   │   │   ├── api.ts        # Axios client with auto token refresh
│   │   │   └── auth.ts       # Auth service, token localStorage management
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
| Axios | 1.6.5 | HTTP client |
| react-router-dom | 6.21.3 | Routing |
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

### Authentication Endpoints (`/api/auth`)
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register with email + password |
| POST | `/api/auth/token` | Login (OAuth2 form data) → access + refresh tokens |
| POST | `/api/auth/refresh` | Refresh access token |

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

### Utility
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |

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
Login/Register → JWT access token + refresh token
    ↓ Stored in localStorage
Axios interceptor adds Bearer token to all requests
    ↓ On 401 response
Auto-refresh using refresh token
    ↓ On refresh failure
Redirect to /login
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
