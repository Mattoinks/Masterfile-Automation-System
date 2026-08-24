"""Pooled Postgres connections + the RLS role-GUC helper.

Two pools, matching supabase/migrations/0001_initial_schema.sql's two roles:

- bypass_connection() -> app_bypass_role (BYPASSRLS). Used by auth_db.py
  (login has no role yet - that's the whole point of validating a session)
  and requests_db.py (today's request_routes.py/auth_service.py call sites
  don't carry role context through to these DB classes, and the plan
  requires zero changes to those callers - RLS on users/sessions/
  rma_requests stays defined for defense-in-depth against any future
  direct-Postgres caller, but FastAPI's require_perm() plus these classes'
  own explicit SQL filtering, e.g. RequestsDB.list_by_user's WHERE clause,
  remain the actual enforcement - unchanged from today's SQLite behavior).
- app_connection(role, user_id=None) -> app_role (RLS-scoped via SET LOCAL
  app.role / app.user_id). For Phase 2's record_service.py/
  processing_service.py/historical_analyzer.py, which already receive an
  authenticated `user` dict at their call sites and so can thread real
  role context through without changing signatures.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from config.settings import SUPABASE_DB_URL, SUPABASE_DB_URL_BYPASS

_app_pool: ConnectionPool | None = None
_bypass_pool: ConnectionPool | None = None


def _get_app_pool() -> ConnectionPool:
    global _app_pool
    if _app_pool is None:
        if not SUPABASE_DB_URL:
            raise RuntimeError("SUPABASE_DB_URL is not set")
        _app_pool = ConnectionPool(
            SUPABASE_DB_URL, min_size=1, max_size=10, kwargs={"row_factory": dict_row}, open=True
        )
    return _app_pool


def _get_bypass_pool() -> ConnectionPool:
    global _bypass_pool
    if _bypass_pool is None:
        if not SUPABASE_DB_URL_BYPASS:
            raise RuntimeError("SUPABASE_DB_URL_BYPASS is not set")
        _bypass_pool = ConnectionPool(
            SUPABASE_DB_URL_BYPASS, min_size=1, max_size=5, kwargs={"row_factory": dict_row}, open=True
        )
    return _bypass_pool


@contextmanager
def bypass_connection() -> Iterator[psycopg.Connection]:
    """A connection as app_bypass_role - RLS does not apply. Commits on a
    clean exit, rolls back on exception - same guarantee AuthDB/RequestsDB
    got from sqlite3's `with self._conn() as conn: ... conn.commit()`."""
    with _get_bypass_pool().connection() as conn:
        yield conn


@contextmanager
def app_connection(role: str, user_id: int | None = None) -> Iterator[psycopg.Connection]:
    """A connection as app_role, with app.role (and app.user_id, for the
    requester-owns-rows rma_requests policy) set for the lifetime of this
    transaction via set_config(..., is_local=true) - required for the RLS
    policies in supabase/migrations/0001_initial_schema.sql to apply.
    SET LOCAL only holds until the transaction commits/rolls back, which
    happens automatically when this `with` block exits."""
    with _get_app_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute("select set_config('app.role', %s, true)", (role,))
            if user_id is not None:
                cur.execute("select set_config('app.user_id', %s, true)", (str(user_id),))
        yield conn
