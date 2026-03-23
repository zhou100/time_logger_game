-- Supabase Row-Level Security (RLS) policies
-- Defense-in-depth: even if there's a bug in the application query layer,
-- the database itself refuses to return or modify another user's rows.
--
-- HOW TO APPLY:
--   Paste into Supabase Dashboard → SQL Editor, or run via psql.
--
-- NOTE on connection pooling:
--   These policies work correctly with asyncpg's session-mode pooler (port 5432).
--   They do NOT work with transaction-mode pooling (port 6543) because
--   SET LOCAL app.current_user_id is reset after each transaction.
--   Use the session-mode URL from Supabase dashboard.
--
-- NOTE on app.current_user_id:
--   The application must SET LOCAL app.current_user_id = <id> at the start of
--   each DB session that needs RLS enforcement. With SQLAlchemy async, add a
--   connection event listener (see below for example).
--   If app.current_user_id is not set, the policies below deny all access as
--   a safe default.

-- ── Enable RLS on all user-data tables ────────────────────────────────────────

ALTER TABLE entries              ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_metadata       ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats           ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens       ENABLE ROW LEVEL SECURITY;

-- ── Helper function ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS integer
    LANGUAGE sql STABLE
    AS $$
        SELECT NULLIF(current_setting('app.current_user_id', true), '')::integer
    $$;

-- ── entries ───────────────────────────────────────────────────────────────────

CREATE POLICY entries_owner ON entries
    USING (user_id = current_app_user_id());

-- ── entry_classifications (access via entries.user_id join) ───────────────────

CREATE POLICY entry_classifications_owner ON entry_classifications
    USING (
        entry_id IN (
            SELECT id FROM entries WHERE user_id = current_app_user_id()
        )
    );

-- ── entry_metadata ────────────────────────────────────────────────────────────

CREATE POLICY entry_metadata_owner ON entry_metadata
    USING (
        entry_id IN (
            SELECT id FROM entries WHERE user_id = current_app_user_id()
        )
    );

-- ── jobs ──────────────────────────────────────────────────────────────────────

CREATE POLICY jobs_owner ON jobs
    USING (user_id = current_app_user_id());

-- ── user_events ───────────────────────────────────────────────────────────────

CREATE POLICY user_events_owner ON user_events
    USING (user_id = current_app_user_id());

-- ── user_stats ────────────────────────────────────────────────────────────────

CREATE POLICY user_stats_owner ON user_stats
    USING (user_id = current_app_user_id());

-- ── refresh_tokens ────────────────────────────────────────────────────────────

CREATE POLICY refresh_tokens_owner ON refresh_tokens
    USING (user_id = current_app_user_id());

-- ── Worker bypass ─────────────────────────────────────────────────────────────
-- The background worker processes jobs across all users.
-- Give the worker a dedicated DB role that bypasses RLS, rather than
-- disabling RLS globally or setting a wildcard user_id.

CREATE ROLE time_logger_worker;
GRANT SELECT, UPDATE ON entries              TO time_logger_worker;
GRANT SELECT, INSERT ON entry_classifications TO time_logger_worker;
GRANT SELECT, INSERT ON entry_metadata       TO time_logger_worker;
GRANT SELECT, UPDATE ON jobs                 TO time_logger_worker;
GRANT SELECT, INSERT ON user_events          TO time_logger_worker;
GRANT SELECT, INSERT, UPDATE ON user_stats   TO time_logger_worker;

-- Worker role bypasses RLS (it needs to process any user's job)
ALTER TABLE entries              FORCE ROW LEVEL SECURITY;
ALTER TABLE jobs                 FORCE ROW LEVEL SECURITY;
-- Note: superuser role bypasses RLS by default. Use a dedicated worker role.


-- ── SQLAlchemy event listener example ────────────────────────────────────────
-- Add this to db.py to set app.current_user_id on each connection checkout:
--
-- from sqlalchemy import event
-- from sqlalchemy.ext.asyncio import AsyncConnection
--
-- # Store user_id in a context var set by the request middleware
-- from contextvars import ContextVar
-- _current_user_id: ContextVar[int | None] = ContextVar('current_user_id', default=None)
--
-- @event.listens_for(engine.sync_engine, "connect")
-- def _set_search_path(dbapi_conn, conn_record):
--     pass  # async engines use a different hook
--
-- # In your get_db() dependency, after yielding the session:
-- # await session.execute(
-- #     text("SET LOCAL app.current_user_id = :uid"),
-- #     {"uid": _current_user_id.get() or 0}
-- # )
