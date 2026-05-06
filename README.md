# Brief

**Speak your day. Get a clear summary, key points, and todos.**

[**Try it → time.yujun.net**](https://time.yujun.net)

Brief is a voice-first debriefing app. Tap the mic, talk for as long as you want, and a few seconds later you have a transcript, a summary, extracted todos, and a category breakdown of where your time and attention went. No typing, no forms, no setup.

Try it once without signing in. If you like what you get back, sign in with Google or an email code and the recording you just made is saved to your account.

---

## What it does

- **Voice in, structure out.** OpenAI Whisper transcribes; GPT-4o-mini extracts todos, ideas, reflections, and time records.
- **Interaction-first landing.** Visitors record and see a real debrief on `/` before being asked to sign in. The save prompt only appears after value has been delivered.
- **Daily and weekly AI coach audits.** Time-weighted category breakdowns surface patterns across recordings.
- **Past record search.** Filters and a deep-linkable day view.
- **Passwordless auth.** 6-digit email code or Google OAuth. No passwords, ever.
- **PWA-installable.** Works on iOS Safari (`audio/mp4`) and Chrome/Firefox (`audio/webm`).
- **Privacy-first anonymous demo.** 24-hour retention on anonymous recordings, hashed IPs, Cloudflare Turnstile bot protection, daily OpenAI spend cap.

## Status

Live at [time.yujun.net](https://time.yujun.net). Current version: **v0.5.5.0** (2026-04-27). See [CHANGELOG.md](CHANGELOG.md) for release history.

The codebase is in active development. Recent focus: anonymous demo pipeline, save-on-signup handoff, and OTP-based email sign-in.

---

## Architecture

```
Browser → React (PWA, MUI, Redux Toolkit)
            │
            ▼
        FastAPI (async, asyncpg, SQLAlchemy 2.0)
            │
            ├─► OpenAI Whisper (transcription)
            ├─► OpenAI GPT-4o-mini (categorization + summary)
            ├─► PostgreSQL 15 (entries, classifications, jobs, audits)
            ├─► S3-compatible storage (audio blobs, 24h TTL for anonymous)
            └─► Supabase Auth (passwordless)
```

### Data model

```
users          ─┬─ entries ─┬─ entry_classifications
                │           └─ jobs (async pipeline state)
                ├─ audit_results (daily/weekly coach summaries)
                └─ notifications
```

See [CLAUDE.md](CLAUDE.md) for the full repository map and conventions.

---

## Local development

### Prerequisites

- Docker + Docker Compose (recommended), or
- Python 3.10+, Node 18+, PostgreSQL 15
- An OpenAI API key

### Run with Docker

```bash
git clone https://github.com/zhou100/time_logger_game.git
cd time_logger_game
cp backend/.env.test backend/.env   # edit OPENAI_API_KEY, SECRET_KEY
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:10000
- API docs: http://localhost:10000/docs

### Run without Docker

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.test .env
alembic upgrade head
uvicorn app.main:app --reload --port 10000

# Frontend (separate terminal)
cd frontend
npm install
npm start
```

### Required environment variables

```bash
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/time_logger_game
SECRET_KEY=<your-secret-key>
OPENAI_API_KEY=<your-openai-key>
ACCESS_TOKEN_EXPIRE_MINUTES=240
ALGORITHM=HS256
ENVIRONMENT=development
```

---

## Tests

```bash
# Backend
cd backend && pytest

# Frontend E2E (requires app running)
cd frontend && npx cypress run
```

## Database migrations

```bash
cd backend
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

---

## API surface

Authenticated endpoints use a Supabase JWT. Anonymous demo endpoints are gated on `PUBLIC_DEMO_ENABLED`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/audio/upload` | Upload, transcribe, categorize |
| `GET` | `/api/audio` | Paginated user entries |
| `GET` | `/api/categories` | List standard + custom categories |
| `POST` | `/api/categories/custom` | Create custom category |
| `POST` | `/v1/public/demo/verify-turnstile` | Issue HMAC permit + session cookie |
| `POST` | `/v1/public/demo/presign` | S3 presigned PUT for anonymous upload |
| `POST` | `/v1/public/demo/submit` | Enqueue anonymous pipeline job |
| `GET` | `/v1/public/demo/status/{entry_id}` | Poll for transcript/summary |
| `POST` | `/api/v1/entries/claim-demo-session` | Save-on-signup handoff |
| `GET` | `/health` | Health check |
| `GET` | `/metrics` | Prometheus exposition |

Full schema: http://localhost:10000/docs

---

## Tech stack

**Backend:** FastAPI 0.104 · SQLAlchemy 2.0 (async) · Alembic · PostgreSQL 15 · OpenAI (Whisper + GPT-4o-mini) · Supabase Auth · slowapi · Prometheus · PostHog

**Frontend:** React 18 · TypeScript · Material-UI · Redux Toolkit · React Router 6 · Axios · react-media-recorder · Cypress

**Infrastructure:** Docker Compose (dev) · Render.com (backend, `time-api.yujun.net`) · Cloudflare Pages (frontend, `time.yujun.net`) · Cloudflare Turnstile · S3-compatible blob storage

---

## Project layout

```
time_logger_game/
├── backend/         FastAPI app, Alembic migrations, pytest suite
├── frontend/        React + TypeScript SPA, Cypress E2E
├── deployment/      Render + Cloudflare config
├── docs/            Design docs and ADRs
├── CLAUDE.md        Repo conventions for AI assistants
├── CHANGELOG.md     Release history
└── DESIGN.md        Design system source of truth
```

The legacy `backend/app/routers/` directory is deprecated; new routes live in `backend/app/routes/`.

---

## Contributing

Brief is a personal portfolio project, but issues and pull requests are welcome.

1. Fork and create a feature branch
2. Run `pytest` and `npm test` before pushing
3. Open a PR against `main`

## License

MIT — see [LICENSE](LICENSE).
