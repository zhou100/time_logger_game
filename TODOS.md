# TODOS

## P1 — Pre-Demo (must complete before hackathon)

### Render Warm-Up Checklist
**What:** Hit `/health` endpoint 5 minutes before demo.
**Why:** Render.com free tier cold-starts can add 10-30s on first request, killing the demo live.
**How to apply:** Add to demo day runbook — open `https://<render-url>/health` in a tab 5 min early.
**Effort:** S (human: 5 min / CC: 5 min — operational, not code)
**Priority:** P1
**Depends on:** Render deployment of backend

---

### E2E Smoke Test
**What:** Full pipeline test: record audio → upload to MinIO → worker processes → entry appears in list.
**Why:** Individual unit tests pass but integration breaks are only caught end-to-end. The async pipeline (queue → MinIO → worker → Whisper → GPT → WebSocket) has multiple failure points.
**How to apply:** Run against staging before demo. Minimum: manual walkthrough of the full flow.
**Effort:** M (human: ~4 hours / CC: ~15 min)
**Priority:** P1
**Depends on:** Multi-entry extraction + audit endpoint complete

---

## P3 — Post-Demo (deferred, do after hackathon)

### Old Model Cleanup
**What:** Remove `Audio`, `CategorizedEntry`, old `/api/audio` routes, and `routers/` directory after demo.
**Why:** The revamp in commit `222c90e` introduced a new `Entry`/`EntryClassification` pipeline but left the old models in place. The dual-model state creates confusion for future contributors.
**Context:** `backend/app/models/audio.py` (Audio), `backend/app/models/categories.py` (CategorizedEntry), `backend/app/routers/` (legacy). Do NOT remove before demo — safe fallback if new pipeline has issues.
**Effort:** M (human: ~2 hours / CC: ~10 min)
**Priority:** P3
**Depends on:** Successful demo using new Entry/EntryClassification pipeline

---

### ~~Audit Persistence~~ — COVERED BY PLAN (Phase 3b)

---

### ~~Legacy Categorization Test Cleanup~~ — COVERED BY PLAN (Phase 4)

---

### ~~Supabase Auth Migration~~ — COVERED BY PLAN (Phase 1)

---

### Supabase Realtime Operational Spec

**What:** Specify RLS policies, channel auth, duplicate delivery handling, and reconnect behavior for Phase 2 (Supabase Realtime).
**Why:** Codex outside voice flagged that Phase 2 is underspecified operationally. The DB-trigger approach works but needs RLS policies to ensure users only see their own notifications, and the frontend needs reconnect/dedup logic.
**Context:** Not blocking implementation of Phases 3a-3d or Phase 0. Must be specified before Phase 1+2 batch begins.
**Effort:** S (human: ~2 hours / CC: ~15 min)
**Priority:** P2
**Depends on:** Supabase project created (Phase 1 prerequisite)

---
