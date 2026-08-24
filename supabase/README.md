# Supabase migration — RMA Masterfile Automation System

This folder is Phase 0 of the staged migration described in
`C:\Users\Matto\.claude\plans\fluttering-soaring-pretzel.md`
("Supabase (PostgreSQL) Migration — RMA Masterfile Automation System"). Read
that plan first — this README only covers how to stand up what it describes,
not why the decisions were made.

**Where this migration currently stands:** schema created, nothing in the app
reads or writes through it yet. `backend/app/services/db.py` and the actual
dual-write/read-cutover changes are Phase 1+ work, done in a later step with
its own verification gate — don't wire the backend to this schema until then.

## What's in this folder

- `migrations/0001_initial_schema.sql` — the full schema: `users`, `sessions`,
  `rma_masterfile_records`, `lot2526_cases`, `lot2526_lot_lines`,
  `rma_requests`. Creates two Postgres roles, enables RLS on every table with
  real per-role policies (no `USING (true)` anywhere), and grants each role
  exactly the privileges it needs.
- `backfill.py` — one-off script that reads the current `.xlsx` workbook plus
  the three SQLite files (`auth.db`, `requests.db`) and loads their data into
  the new schema. Not part of the running app; run it manually, once, from a
  terminal.

## 1. Create the Supabase project

Manual step, done once in the Supabase dashboard (supabase.com) — this can't
be scripted from here:

1. Create a new project on the Free tier.
2. Note the database password you set — you'll need it for the connection
   strings below.
3. In **Project Settings → Database**, copy the **connection string** for
   both:
   - **Session pooler** (port 5432 or 6543 depending on region) — used for
     `SUPABASE_DB_URL_BYPASS` (the auth pre-auth path — low volume, session
     mode is fine and simplest).
   - **Transaction pooler** (port 6543, pgbouncer transaction mode) — used
     for `SUPABASE_DB_URL` (the main pooled connection). Transaction-mode
     pooling is safe here specifically because the backend always issues
     `SET LOCAL app.role = ...` and the real query inside the *same*
     transaction — `SET LOCAL` is scoped to a transaction, so it survives
     pgbouncer handing the underlying connection back to the pool afterward.
     Don't use `SET` (without `LOCAL`) with a transaction-mode pooler — it
     would leak the role setting onto whatever connection picks up next.

## 2. Apply the schema

Run `migrations/0001_initial_schema.sql` once, via the Supabase SQL editor
(dashboard → SQL Editor → paste the file → Run) or `psql`:

```
psql "<direct connection string from the dashboard>" -f supabase/migrations/0001_initial_schema.sql
```

Use the **direct** connection (not a pooler) for DDL — `CREATE ROLE` and
schema changes need a non-pooled session.

After it runs, set passwords for the two roles it created (the migration
deliberately does not set them — don't commit secrets):

```sql
alter role app_role with password '<generate a strong password>';
alter role app_bypass_role with password '<generate a different strong password>';
```

Build the two connection strings using those passwords and the pooler hosts
from step 1, then set them as backend env vars (see `backend/.env.example`):

```
SUPABASE_DB_URL=postgresql://app_role:<password>@<transaction-pooler-host>:6543/postgres
SUPABASE_DB_URL_BYPASS=postgresql://app_bypass_role:<password>@<session-pooler-host>:5432/postgres
```

## 3. Verify row counts before touching the live app

Before running the backfill against real data, run it against a **copy** of
the current `.xlsx` and SQLite files first, and compare row counts against
the originals:

- `rma_masterfile_records` count per `fy` should match each worksheet's
  populated row count (`FY2526`/`FY2627`/`FY2728`).
- `lot2526_cases` count should match the number of distinct case numbers in
  the `'2526'` sheet's column A.
- `users` / `sessions` / `rma_requests` counts should match `auth.db` /
  `requests.db` exactly.

Only once these match on a copy should `backfill.py` be pointed at the real
files and a real Supabase project.

## Why two roles instead of one

- `app_role` — used for every request that has already passed the existing
  `require_perm(...)` FastAPI dependency. RLS policies on this role are
  **defense-in-depth**, not the primary permission check (several real
  permissions like `force_insert` vs `insert` map to the same SQL verb and
  can't be expressed as RLS alone) — `require_perm()` stays primary.
- `app_bypass_role` — `BYPASSRLS`, used only where there's no role to key RLS
  off yet: login, session-token validation, session create/delete/cleanup.
  Scoped to exactly that — it is not a superuser and has no other grants.

## What's deliberately NOT in this schema

See the plan's "Explicitly NOT created" section and Open Questions §1–2 for
the reasoning — briefly: no `rma_index.db` equivalent (real indexes replace
it), no `pending_review_records` table, no duplicate-cache table, no
`audit_log` tables, and no columns for the 6 unmapped FY2526 fields or the 7
`'2526'` sheet N–T columns — all confirmed empty across the entire backup
history by direct inspection of the workbook, not modeled speculatively.
