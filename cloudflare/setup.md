# Cloudflare Setup Guide

## Architecture

```
Browser → Cloudflare Pages (React frontend)
        → Render.com backend (FastAPI + WebSocket)
              → Supabase (PostgreSQL)
              → Cloudflare R2 (audio storage, via presigned URLs)
        → Cloudflare R2 (direct PUT — audio never hits the app server)
```

---

## 1. Cloudflare R2 — Object Storage

### Create bucket

```bash
# Using wrangler CLI (npm i -g wrangler, then wrangler login)
wrangler r2 bucket create time-logger-audio
```

Or create via the Cloudflare dashboard → R2 → Create bucket.

### Apply CORS policy

```bash
wrangler r2 bucket cors put time-logger-audio \
  --file cloudflare/r2-cors-policy.json
```

**Edit `r2-cors-policy.json` first** — replace `yourdomain.com` with your actual domain.

### Create API token

Dashboard → R2 → Manage R2 API Tokens → Create API Token:
- Permissions: Object Read & Write
- Bucket: `time-logger-audio`

Note the **Access Key ID** and **Secret Access Key** — you'll need them for Render env vars.

### R2 endpoint

```
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Find your Account ID in the Cloudflare dashboard sidebar.

### Optional: Custom domain for R2

Dashboard → R2 → `time-logger-audio` → Settings → Custom Domain.
Attach a domain like `audio.yourdomain.com`. This gives cleaner presigned URLs
and avoids needing a CORS wildcard on `*.r2.cloudflarestorage.com`.

---

## 2. Supabase — PostgreSQL

1. Create a project at https://supabase.com
2. Dashboard → Settings → Database → **Connection string**
3. Choose **Session mode** (port 5432) — required for asyncpg

```
# App (asyncpg)
DATABASE_URL=postgresql+asyncpg://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

# Alembic runs migrations using the sync URL (alembic/env.py strips +asyncpg automatically)
```

**Free-tier note**: Direct connections require an IPv4 Add-on ($4/month). The session-mode pooler URL works on all plans without it.

---

## 3. Render.com — Backend + Worker

1. Connect your GitHub repo at https://render.com
2. New → Blueprint → point to `render.yaml`
3. Render will create two services: `time-logger-backend` and `time-logger-worker`
4. Set these env vars in the dashboard for **both services**:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Supabase session-pooler URL (asyncpg format) |
| `SECRET_KEY` | `openssl rand -hex 32` |
| `OPENAI_API_KEY` | Your OpenAI key |
| `S3_ENDPOINT_URL` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY` | R2 Access Key ID |
| `S3_SECRET_KEY` | R2 Secret Access Key |
| `ALLOWED_ORIGINS` | `https://time-logger.pages.dev,https://yourdomain.com` |

On first deploy, Render runs `scripts/start.py` which applies all Alembic migrations automatically.

**Free-tier note**: Render free tier spins services down after 15 minutes of inactivity
(cold start ~30s). Upgrade to Starter ($7/mo) for always-on.

---

## 4. Cloudflare Pages — Frontend

### Connect repo

Dashboard → Pages → Create a project → Connect to Git → select this repo.

### Build settings

| Field | Value |
|-------|-------|
| Framework preset | Create React App |
| Build command | `npm run build` |
| Build output directory | `build` |
| Root directory | `frontend` |

### Environment variables

| Key | Value |
|-----|-------|
| `REACT_APP_API_URL` | `https://time-logger-backend.onrender.com` |

> The `_redirects` file in `frontend/public/` handles SPA routing automatically.

### Custom domain

Pages → your project → Custom domains → Add domain.

---

## 5. Verify end-to-end

```bash
# 1. Check backend health
curl https://time-logger-backend.onrender.com/health

# 2. Register a test user
curl -X POST https://time-logger-backend.onrender.com/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"testpass123"}'

# 3. Open frontend
open https://time-logger.pages.dev
```

---

## Local dev stays the same

```bash
docker-compose up --build
# Backend: http://localhost:10000
# Frontend: http://localhost:3000
# MinIO console: http://localhost:9001 (minioadmin / minioadmin)
```

MinIO is used locally; R2 is used in production. The storage service code is identical — only the env vars change.
