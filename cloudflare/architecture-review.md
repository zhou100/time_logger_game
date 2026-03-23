# Architecture Review — Cloudflare Free Tier Opportunities
_Time Logger Game · March 2026_

---

## 1. Current Architecture Map

```
Browser (React SPA)
  │
  ├─ Static assets ──────────► Cloudflare Pages       ✅ FREE (unlimited static)
  │
  ├─ API + WebSocket ────────► Render.com (FastAPI)   💰 PAID ~$14/mo (2 × starter)
  │    │                         ├── Supabase (PostgreSQL) 🟡 FREE (500 MB, then paid)
  │    │                         ├── PostgreSQL queue       (SELECT FOR UPDATE SKIP LOCKED)
  │    │                         └── WebSocket manager      (in-memory, single-process)
  │    │
  │    └─ Audio pipeline ────► Render.com (Worker)     💰 included in above estimate
  │         ├── OpenAI Whisper                          💰 PAID per minute
  │         └── OpenAI GPT-4o-mini                     💰 PAID per token
  │
  └─ Audio upload (PUT) ────► Cloudflare R2             ✅ FREE (10 GB / 1M ops mo)
```

### Monthly cost estimate (low traffic)
| Service | Cost |
|---|---|
| Render starter × 2 (backend + worker) | ~$14/mo |
| OpenAI Whisper (est. 100 clips × 30s) | ~$0.30/mo |
| OpenAI GPT-4o-mini (est. 100 calls) | ~$0.01/mo |
| Supabase (< 500 MB) | $0 |
| Cloudflare Pages + R2 | $0 |
| **Total** | **~$14.31/mo** |

The dominant cost is Render.com. Everything else is negligible or free.

---

## 2. Cloudflare Free Tier — What's Available

| Product | Free Allowance | Relevant For |
|---|---|---|
| **Pages** | Unlimited static, 500 builds/mo | Frontend ✅ already using |
| **R2** | 10 GB storage, 1M Class A, 10M Class B / mo | Audio storage ✅ already using |
| **Workers** | 100K req/day, **10ms CPU/req** | API gateway, auth proxy |
| **Workers KV** | 100K reads/day, 1K writes/day | Distributed rate limits, cache |
| **D1** | 5M rows read/day, 100K rows written/day, 5 GB | SQLite DB (Workers-only access) |
| **Queues** | 10K operations/day, 24h retention | Replace PostgreSQL queue |
| **Workers AI** | ~10K neurons/day (Whisper + LLMs) | Transcription + classification |
| **Durable Objects** | 5 GB SQLite, 100K req/day | WebSocket coordination |
| **Tunnel** | Unlimited | Secure origin-to-CF connection |

---

## 3. What Can and Cannot Move to Cloudflare Free

### 3.1 Cannot move: FastAPI backend (as-is)

Workers use V8 isolates (JS/TS/Wasm). Cloudflare now has **Python Workers via Pyodide**,
but they are still experimental and cannot run:
- `asyncpg` (native C extension)
- `SQLAlchemy` async engine
- `aioboto3` / `boto3`

The entire backend would need to be rewritten in TypeScript/JavaScript (or Hono/Itty Router)
to run natively on Workers. This is **high-effort** and a full rewrite.

**10ms CPU limit on free Workers** is the other hard blocker — although most time is spent
waiting on I/O (DB, R2, OpenAI), request parsing and JWT validation alone can exceed 10ms
for a complex FastAPI app on cold start.

**Verdict**: Keep FastAPI on Render for now. Cloudflare Workers can act as an edge gateway
in front of Render without replacing it.

### 3.2 Can move: Job queue → Cloudflare Queues

The current queue is a PostgreSQL-backed `SELECT FOR UPDATE SKIP LOCKED` poller.
Cloudflare Queues is now free (10K ops/day = ~3,333 messages/day) and eliminates the
need to poll the DB every 2 seconds.

Migration strategy:
- Workers producer: after `POST /submit`, push `{ entry_id, user_id }` to CF Queue
- Python worker becomes an **HTTP pull consumer** (hits CF Queues REST API to dequeue)
- Removes the need for a Jobs table entirely (or keep it just for status tracking)

**Caveat**: 10K ops/day is fine for development and low-traffic. At scale ($0.40/M ops)
it remains very cheap.

### 3.3 Can move: OpenAI → Workers AI (experimental)

Cloudflare Workers AI provides:
- `@cf/openai/whisper` — speech-to-text, same model family as Whisper v2
- `@cf/meta/llama-3.1-8b-instruct` — for classification (vs GPT-4o-mini)

The pipeline would call Workers AI REST API from Python (or from a Workers script)
instead of OpenAI's API.

**Trade-offs**:
- ✅ Free within neuron budget (~10K req/day)
- ✅ Data stays within Cloudflare's network (no OpenAI data retention concerns)
- ⚠️  Whisper accuracy may differ slightly for noisy audio
- ⚠️  Llama 3.1 8B classification quality is lower than GPT-4o-mini
- ⚠️  Workers AI is not guaranteed zero-cost — neuron quotas change

**Verdict**: Worth prototyping. Classification with a smaller model is fine for
TODO/IDEA/QUESTION/REMINDER (simple 4-class problem). Transcription quality should be
evaluated against real audio before switching.

### 3.4 Can move: Rate limiting → Workers KV

The current rate limiter is in-memory Python (resets on restart, not multi-instance safe).
Workers KV (100K reads/day, 1K writes/day free) can store rolling counters at the edge,
before requests even hit Render.

Pattern: Workers middleware increments a counter in KV keyed by `user_id:minute`.
If > threshold, return 429 immediately without touching Render.

### 3.5 Can move: WebSocket push → polling or SSE (downgrade)

The current WebSocket `ConnectionManager` is in-memory, scoped to a single Render process.
It works fine for one instance. Moving to Workers would require Durable Objects for
cross-instance pub/sub.

**Free-tier option**: Replace WebSocket with **Server-Sent Events (SSE)** or simple polling.

- SSE: `GET /entries/{id}/status` streams until `status=done`. Workers can proxy this.
- Polling: the React app polls `GET /entries/{id}/status` every 2s until done.
  Simple, works everywhere, no WebSocket infrastructure.

The UX impact is minimal for this use case (average audio clip < 10s to process).

### 3.6 Can add: Workers as Edge API Gateway

Even keeping Render as the origin, a thin Workers script can:
- Terminate TLS + DDOS protection at the edge (already from Cloudflare proxy)
- Validate JWT at the edge (save Render a round-trip for invalid tokens)
- Cache `GET /entries` list responses for 5-10s (massive reduction in DB reads)
- Enforce CORS and security headers globally
- Route `/api/v1/*` to Render and `/ws` to Render (pass-through)

Workers gateway cost: **$0** (well within 100K req/day free for this traffic pattern).

---

## 4. Recommended Migration Path

### Phase 0 — Already done ✅
- Cloudflare Pages (frontend)
- Cloudflare R2 (audio storage, private bucket, presigned URLs)

### Phase 1 — Quick wins, zero cost

**1a. Workers Edge Gateway** (1 day effort)
```
Browser → Cloudflare Workers (edge) → Render FastAPI
```
- Create `workers/api-gateway/` with Hono or plain Workers fetch handler
- Pass-through all requests to `RENDER_BACKEND_URL`
- Add response caching for `GET /entries` (5s TTL via Cache API)
- Add security headers (`X-Frame-Options`, `X-Content-Type-Options`, CSP)
- Auth short-circuit: decode JWT signature at edge, reject clearly invalid tokens

**1b. Workers KV Rate Limiting** (2 hours effort)
- Replace the in-process Python presign rate limiter with Workers KV
- Works across Render restarts and multiple backend instances

**1c. Cloudflare Tunnel** (1 hour effort)
- Run `cloudflared tunnel` in Render to secure origin → Cloudflare connection
- Allows locking Render to only accept traffic from Cloudflare IPs
- Free, no bandwidth charges

### Phase 2 — Medium effort, eliminates OpenAI cost

**2a. Workers AI — Classification** (1 day)
- Replace GPT-4o-mini with `@cf/meta/llama-3.1-8b-instruct`
- The 4-class problem (TODO/IDEA/QUESTION/REMINDER) is simple enough
- Evaluation: run both models on 50 real transcripts, compare accuracy
- Cost saving: ~$0/mo (was ~$0.01/mo — negligible, but removes API dependency)

**2b. Workers AI — Transcription** (1 day)
- Replace `openai.audio.transcriptions` with CF Workers AI Whisper REST API
- Python worker calls `https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/@cf/openai/whisper`
- Cost saving: ~$0.30/mo (meaningful if volume grows)
- **Evaluate quality first** against your actual audio samples

### Phase 3 — High effort, structural changes

**3a. Replace PostgreSQL queue with Cloudflare Queues** (2-3 days)
```
Submit endpoint → CF Queue producer → CF Queues → Python HTTP pull consumer
```
- Removes: Jobs table polling, SELECT FOR UPDATE SKIP LOCKED complexity
- Adds: CF Queues account setup, HTTP pull consumer in Python worker
- Keep: Jobs table for status tracking (but no longer a queue)
- Free limit: 10K ops/day (~3,333 entries/day). Well above current need.

**3b. Replace WebSocket with SSE polling** (1 day)
- Remove `routes/v1/ws.py` and `ConnectionManager`
- Add `GET /entries/{id}/events` SSE endpoint in FastAPI
- React: `useEventSource` hook instead of `useWebSocket`
- Simpler architecture, no shared-state problem, works behind Cloudflare proxy

**3c. D1 instead of Supabase** (1 week, only if going full Workers)
- Only accessible from Workers scripts — requires full backend rewrite to TypeScript
- **Not recommended** unless you are willing to rewrite the backend

---

## 5. Decision Matrix

| Change | Effort | Monthly Saving | Free Tier Risk | Recommendation |
|---|---|---|---|---|
| Workers edge gateway | Low (1d) | $0 (perf/UX gain) | Low | ✅ Do it |
| Workers KV rate limiting | Low (2h) | $0 | Low | ✅ Do it |
| Cloudflare Tunnel | Very Low (1h) | $0 | None | ✅ Do it |
| Workers AI classification | Medium (1d) | ~$0/mo | Medium (quality) | 🟡 Evaluate |
| Workers AI transcription | Medium (1d) | ~$0.30/mo | Medium (quality) | 🟡 Evaluate |
| CF Queues replace PG queue | Medium (2-3d) | $0 | Low | 🟡 Nice to have |
| SSE replace WebSocket | Medium (1d) | $0 | Low | 🟡 Nice to have |
| D1 + full Workers rewrite | Very High (1-2wk) | ~$14/mo | High | ❌ Not worth it |

---

## 6. What the Architecture Looks Like After Phase 1+2

```
Browser (React SPA)
  │
  ├─ Static assets ──────────► Cloudflare Pages           FREE
  │
  ├─ API requests ──────────► Cloudflare Workers (gateway) FREE
  │    │  ├─ invalid JWT → 401 at edge (Render never sees it)
  │    │  ├─ GET /entries → cache 5s (90%+ cache hit for lists)
  │    │  └─ everything else → pass-through
  │    │
  │    └─► Render.com (FastAPI)                           💰 ~$14/mo
  │           └─► Supabase (PostgreSQL)                   FREE (<500MB)
  │
  ├─ Audio PUT ─────────────► Cloudflare R2               FREE (presigned URL)
  │
  └─ Audio pipeline
       ├─ Transcription ────► Cloudflare Workers AI        FREE (quota)
       └─ Classification ───► Cloudflare Workers AI        FREE (quota)
```

**Net savings: ~$0.30/mo on API costs. Main value is eliminating OpenAI dependency
and improving edge performance, not cost reduction at this scale.**

The only way to eliminate the ~$14/mo Render cost is a full TypeScript Workers rewrite
(backend + worker), which is not recommended unless the project outgrows Render's free tier
or you want to go fully serverless.

---

## 7. Workers AI — API Call from Python

For Phase 2, here's the pattern to call Workers AI from the existing Python worker
without touching the Workers runtime:

```python
# services/workers_ai.py
import httpx
from ..settings import settings

CF_AI_BASE = f"https://api.cloudflare.com/client/v4/accounts/{settings.CF_ACCOUNT_ID}/ai/run"

async def transcribe_audio(audio_bytes: bytes, suffix: str = ".webm") -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{CF_AI_BASE}/@cf/openai/whisper",
            headers={"Authorization": f"Bearer {settings.CF_AI_TOKEN}"},
            content=audio_bytes,
            headers={"Content-Type": "application/octet-stream"},
        )
        resp.raise_for_status()
        return resp.json()["result"]["text"]

async def classify_text(text: str) -> dict:
    prompt = f"""Classify this voice note as one of: TODO, IDEA, QUESTION, REMINDER.
Voice note: {text}
Return JSON: {{"category": "...", "confidence": 0.0-1.0}}"""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{CF_AI_BASE}/@cf/meta/llama-3.1-8b-instruct",
            headers={"Authorization": f"Bearer {settings.CF_AI_TOKEN}"},
            json={"messages": [{"role": "user", "content": prompt}]},
        )
        resp.raise_for_status()
        # parse JSON from the model response
        import json
        content = resp.json()["result"]["response"]
        return json.loads(content)
```

New env vars needed:
```
CF_ACCOUNT_ID=<from Cloudflare dashboard → Workers & Pages → Overview>
CF_AI_TOKEN=<API token with Workers AI:Read permission>
```

---

## 8. Workers Edge Gateway — Minimal Implementation

```typescript
// workers/gateway/src/index.ts
import { Hono } from 'hono'
import { cache } from 'hono/cache'

const app = new Hono()

const ORIGIN = 'https://time-logger-backend.onrender.com'

// Cache list endpoint at the edge
app.get('/api/v1/entries',
  cache({ cacheName: 'entries', cacheControl: 'max-age=5' }),
  (c) => fetch(`${ORIGIN}${c.req.url.replace(c.req.header('host')!, '')}`, {
    headers: c.req.raw.headers,
  })
)

// Pass-through everything else
app.all('*', (c) =>
  fetch(`${ORIGIN}${new URL(c.req.url).pathname}${new URL(c.req.url).search}`, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  })
)

export default app
```

Deploy: `wrangler deploy` — binds to your Pages custom domain or a `*.workers.dev` subdomain.

---

## 9. Next Steps (Suggested Order)

1. [ ] Set up Workers gateway (Hono + Wrangler) — `workers/gateway/`
2. [ ] Add Cloudflare Tunnel (`cloudflared`) to Render deploy
3. [ ] Evaluate Workers AI Whisper quality against 20 real audio samples
4. [ ] If quality acceptable: replace OpenAI calls with Workers AI
5. [ ] Consider CF Queues if the PostgreSQL poll becomes a bottleneck
6. [ ] Consider full Workers rewrite only if Render costs become untenable

---

_Sources_:
- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)
- [R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [Queues now on Free Plan](https://developers.cloudflare.com/changelog/2026-02-04-queues-free-plan/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
