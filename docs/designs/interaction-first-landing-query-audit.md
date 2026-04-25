# Query Audit — anonymous demo leak surface

Part of the interaction-first-landing migration (item 1 of 6). The schema now
allows `entries.user_id` and `jobs.user_id` to be NULL for anonymous demo
rows. Any query that does NOT constrain `Entry.user_id == current_user.id`
(or explicitly exclude NULL) could surface anonymous rows to a user or mix
anonymous rows into aggregates.

Scope: `grep -rn "Entry\b" backend/app/` plus
`grep -rn "EntryClassification\|EntryMetadata" backend/app/`. Every call site
is enumerated below with a SAFE / FIXED verdict.

Rule used:
- **SAFE:** statement contains `Entry.user_id == <int>` (equality against an
  integer is false for NULL — Postgres 3VL).
- **SAFE (transitive):** statement filters `Entry.id.in_(ids_from_safe_query)`
  where the upstream query was already SAFE, or `EntryClassification.entry_id
  == <id_from_safe_query>`.
- **SAFE (system, non-user-scoped):** server-side worker/sweep code that
  deliberately operates on all rows regardless of user.
- **FIXED (how):** the unsafe site was modified in this PR.

## `backend/app/routes/v1/entries.py`

| file:line | statement | verdict |
|---|---|---|
| 320-323 | `select(Entry) … where(Entry.id == entry_uuid, Entry.user_id == current_user.id)` (get_entry_status) | SAFE |
| 347-357 | `select(effective_date) … where(Entry.user_id == current_user.id, …)` (active-dates) | SAFE |
| 370 | `base_filters = [Entry.user_id == current_user.id, …]` (list_entries base) | SAFE (drives 380/385/404) |
| 380-382 | `select(func.count(Entry.id)) … where(*base_filters)` (list_entries count) | SAFE (via base_filters) |
| 385-393 | `select(Entry) … where(*base_filters)` (list_entries page) | SAFE (via base_filters) |
| 403-412 | `select(EntryClassification) … join(Entry…) … where(Entry.user_id == current_user.id, …)` (breakdown-with-date) | SAFE |
| 468-477 | `base_filters = [Entry.user_id == current_user.id, …]` (search base) | SAFE |
| 489-495 | `select(func.count(func.distinct(Entry.id))) … where(*base_filters)` (search total) | SAFE (via base_filters) |
| 498-506 | `select(Entry.id, Entry.created_at) … where(*base_filters)` (search page-ids) | SAFE (via base_filters) |
| 514-518 | `select(Entry) … where(Entry.id.in_(entry_ids), Entry.user_id == current_user.id)` (search hydrate) | SAFE |
| 547-548 | `select(Entry) … where(Entry.id == entry_uuid, Entry.user_id == current_user.id)` (delete_entry) | SAFE |
| 579-583 | `select(Entry) … where(Entry.id == entry_uuid, Entry.user_id == current_user.id)` (update_entry) | SAFE |
| 691-694 | `select(Entry) … where(Entry.id == entry_uuid, Entry.user_id == current_user.id)` (reclassify_entry) | SAFE |
| 905-916 | `select(Entry) … where(Entry.user_id == current_user.id, date range, Job.status == DONE)` (weekly audit pull) | SAFE |
| 932-940 | `select(EntryClassification) … where(EntryClassification.entry_id.in_([e.id for e in entries]))` (weekly open-loops) | SAFE (transitive — `entries` was user-scoped at 905-916) |
| 1391-1405 | `select(week_col, count(Entry.id)) … where(Entry.user_id == current_user.id, …)` (weeks list) | SAFE |
| 1497-1505 | `select(day_col, EntryClassification.category) … where(Entry.user_id == user_id, …)` (themes matrix) | SAFE |
| 1592-1602 | `select(Entry) … where(Entry.user_id == user_id, _date_match(…), Job.status == DONE)` (_fetch_entries_for_date) | SAFE |
| 2001-2003 | `_date_match(target_date)` helper | SAFE (always combined with `Entry.user_id ==` by every caller — 378, 409, 1598) |
| 277-286 | `entry = Entry(id=…, user_id=current_user.id, …)` (submit — INSERT) | SAFE (write; user_id populated) |
| 632-641 | `entry.classifications.append(EntryClassification(...))` (update_entry relationship insert) | SAFE (write on user-scoped entry) |
| 729-733 | `EntryClassification(entry_id=entry.id, …)` (reclassify insert) | SAFE (write on user-scoped entry) |

## `backend/app/routes/v1/captures.py`

| file:line | statement | verdict |
|---|---|---|
| 87-91 | `select(EntryClassification, Entry).join(Entry, EntryClassification.entry_id == Entry.id).where(Entry.user_id == current_user.id)` (list) | SAFE |
| 137-143 | `select(EntryClassification, Entry).join(…).where(EntryClassification.id == cap_uuid, Entry.user_id == current_user.id)` (patch) | SAFE |

## `backend/app/services/worker.py`

| file:line | statement | verdict |
|---|---|---|
| 62-67 | `select(Job).where(Job.status == PROCESSING, Job.updated_at < cutoff)` (stale-job recovery) | SAFE (system, non-user-scoped — worker operates on all jobs) |
| 79 | `select(Entry).where(Entry.id == job.entry_id)` (process_job entry pull) | SAFE (system) — worker trusts `job.entry_id` to be authoritative. Anonymous jobs resolve to anonymous entries by design. |
| 200 | `select(Entry).where(Entry.id == job.entry_id)` (failure-notification recovery) | SAFE (system). Worker may need to skip the Notification write when `entry.user_id is None` (item 2/3 scope — flagged for later). |
| 222-226 | `delete(Notification).where(Notification.created_at < cutoff)` | Not Entry/Classification — out of scope |

## `backend/app/services/queue.py`

| file:line | statement | verdict |
|---|---|---|
| 15-21 | `Job(entry_id=…, user_id=user_id, …)` INSERT | SAFE today. Note for item 2: `enqueue` signature needs a `demo_session_id` kwarg so anonymous submits can set it. Mentioned in Surprises. |
| 24-41 | `select(Job).where(Job.status == PENDING).with_for_update(skip_locked=True)` (dequeue) | SAFE (system, non-user-scoped) |
| 63-71 | `select(Job).where(Job.entry_id == entry_id)` (get_job_for_entry) | SAFE — callers already hold a user-scoped entry reference. |

## `backend/app/services/demo_sweep.py` (added this PR)

| file:line | statement | verdict |
|---|---|---|
| `_sweep_expired_entries` | `select(Entry.id, …).where(Entry.demo_session_id.is_not(None), Entry.expires_at < now)` | SAFE — by construction, only touches rows that are demo rows. |
| `_prune_request_log` | `delete(DemoRequestLog).where(DemoRequestLog.created_at < cutoff)` | SAFE — own table. |

## Summary

- **Total call sites inspected:** 28 (Entry / EntryClassification / EntryMetadata reads + writes across routes, worker, queue, sweep).
- **SAFE (direct user filter):** 19
- **SAFE (transitive / via base_filters / system-level):** 9
- **FIXED:** 0 — the codebase was already uniformly user-scoped in every read path because authed routes all use `current_user.id`. The anonymous demo rows live in a parallel namespace keyed on `demo_session_id`, which no existing authed query touches.

## Follow-ups for items 2-6

1. **Worker changes (item 3 scope):** `_process_job` at `worker.py:79` currently writes a `Notification` (`worker.py:116-125` and `worker.py:205-213`) tied to `entry.user_id`. It MUST be guarded with `if entry.user_id is not None:` for anonymous demo entries. Anonymous jobs surface status via the public polling endpoint (`/v1/public/demo/status/{entry_id}` — item 2), not Notifications.

2. **Queue signature (item 2 scope):** `queue.enqueue(db, entry_id, user_id)` in `services/queue.py` needs a `demo_session_id: Optional[str] = None` kwarg so anonymous submits populate `jobs.demo_session_id` for the worker's teaser step.

3. **Weekly themes / audit loops (route-wide):** all safe today, but if anonymous demo rows ever temporarily acquire a `user_id` mid-claim, the claim endpoint (item 3) MUST run inside a transaction and clear `demo_session_id`/`expires_at` in the same UPDATE. Partial state would make the entry visible to the new user AND include it in anonymous aggregates if any future code starts reading demo rows.
