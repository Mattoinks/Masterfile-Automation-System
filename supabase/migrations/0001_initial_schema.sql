-- Phase 0 — initial schema for the RMA Masterfile Automation System.
-- Creates structure only. No app code reads or writes through this schema
-- yet (that starts in Phase 1) — see C:\Users\Matto\.claude\plans\fluttering-soaring-pretzel.md.
--
-- Two Postgres roles are created here, matching the plan's "Confirmed
-- Architecture" section:
--   app_role         - used by the backend's main pooled connection for every
--                       request that has already passed require_perm(). RLS
--                       policies below key off two session GUCs the backend
--                       sets with `SET LOCAL` inside the same transaction as
--                       the query: app.role and app.user_id.
--   app_bypass_role  - BYPASSRLS, used ONLY for the pre-authentication path
--                       (login, session validation, session create/delete,
--                       cleanup_expired_sessions) where no app.role exists
--                       yet to key RLS off. Not a superuser - scoped to
--                       exactly this purpose.
-- Passwords are intentionally not set here (do not commit secrets) - set
-- them once via the Supabase SQL editor or dashboard, then put the two
-- resulting connection strings in SUPABASE_DB_URL / SUPABASE_DB_URL_BYPASS.
-- See supabase/README.md.

create role app_role with login;
create role app_bypass_role with login bypassrls;

grant usage on schema public to app_role, app_bypass_role;

-- Shared helper: touches updated_at on every UPDATE. Applied per-table below.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- users (replaces auth.db.users)
-- ---------------------------------------------------------------------
create table users (
    id             integer generated always as identity primary key,
    username       text not null unique,
    password_hash  text not null,
    display_name   text not null,
    role           text not null check (role in ('admin', 'engineer', 'viewer', 'requester')),
    active         boolean not null default true,
    created_at     timestamptz not null default now(),
    last_login     timestamptz
);

alter table users enable row level security;

-- Normal authenticated path (app_role): only an admin session may read/write
-- the users table (User Management page). The pre-auth login lookup by
-- username goes through app_bypass_role instead, which is unaffected by
-- these policies.
create policy users_select_admin on users
    for select to app_role
    using (current_setting('app.role', true) = 'admin');

create policy users_insert_admin on users
    for insert to app_role
    with check (current_setting('app.role', true) = 'admin');

create policy users_update_admin on users
    for update to app_role
    using (current_setting('app.role', true) = 'admin')
    with check (current_setting('app.role', true) = 'admin');

-- No delete policy: the app never hard-deletes users (deactivation is an
-- UPDATE of active=false), matching today's behavior.

grant select, insert, update on users to app_role;
grant select, insert, update on users to app_bypass_role;
grant usage, select on sequence users_id_seq to app_role, app_bypass_role;

-- ---------------------------------------------------------------------
-- sessions (replaces auth.db.sessions)
-- ---------------------------------------------------------------------
create table sessions (
    token        text primary key,
    user_id      integer not null references users(id) on delete cascade,
    expires_at   timestamptz not null,
    remember_me  boolean not null default false,
    created_at   timestamptz not null default now()
);

create index idx_sessions_user_id on sessions(user_id);

alter table sessions enable row level security;
-- Deliberately zero policies for app_role: sessions are only ever touched
-- through app_bypass_role (login, validate_token, logout, cleanup), so a
-- normal app_role connection gets no access at all, matching the RLS matrix.

grant select, insert, update, delete on sessions to app_bypass_role;

-- ---------------------------------------------------------------------
-- rma_masterfile_records (replaces the FY2526/FY2627/FY2728 worksheets)
-- ---------------------------------------------------------------------
create table rma_masterfile_records (
    id                      bigint generated always as identity primary key,
    fy                      text not null,
    case_id                 text not null,

    dn_date                 text,
    data_source             text,
    rma_number              text,
    store_received          text,
    recd_lw                 text,
    recd_mth                text,
    dn_number               text,
    type_of_return          text,
    device                  text,
    package                 text,
    gf                      text,
    date_code               text,
    dc_bau                  text,
    test_bau                text,
    vkl_bau                 text,
    dc                      text,
    owner                   text,
    rework_flow_procedure   text,
    cause_owner             text,
    case_title              text,
    store_lot_qty           text,

    quantity                numeric,
    status                  text not null default 'Open',

    row_number              integer,  -- transitional only; Excel row index for Phase 1/2 diffing, dropped once Excel is export-only (Phase 3)

    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),

    constraint uq_masterfile_fy_case_id unique (fy, case_id)
);

create index idx_masterfile_dn on rma_masterfile_records(dn_number);
create index idx_masterfile_device on rma_masterfile_records(device);
create index idx_masterfile_owner on rma_masterfile_records(owner);
create index idx_masterfile_package on rma_masterfile_records(package);
create index idx_masterfile_status on rma_masterfile_records(status);
create index idx_masterfile_rma_number on rma_masterfile_records(rma_number);
-- Matches the exact query shape DuplicateService/the index-cache replacement
-- needs: "every active record" (excludes Deleted/Archived).
create index idx_masterfile_active on rma_masterfile_records(fy)
    where status not in ('Deleted', 'Archived');

create trigger trg_masterfile_updated_at
    before update on rma_masterfile_records
    for each row execute function set_updated_at();

alter table rma_masterfile_records enable row level security;

create policy masterfile_select on rma_masterfile_records
    for select to app_role
    using (current_setting('app.role', true) in ('admin', 'engineer', 'viewer'));

create policy masterfile_insert on rma_masterfile_records
    for insert to app_role
    with check (current_setting('app.role', true) in ('admin', 'engineer'));

create policy masterfile_update on rma_masterfile_records
    for update to app_role
    using (current_setting('app.role', true) in ('admin', 'engineer'))
    with check (current_setting('app.role', true) in ('admin', 'engineer'));

create policy masterfile_delete on rma_masterfile_records
    for delete to app_role
    using (current_setting('app.role', true) = 'admin');

grant select, insert, update, delete on rma_masterfile_records to app_role;
grant usage, select on sequence rma_masterfile_records_id_seq to app_role;

-- ---------------------------------------------------------------------
-- lot2526_cases / lot2526_lot_lines (replaces the '2526' worksheet)
-- ---------------------------------------------------------------------
create table lot2526_cases (
    id          bigint generated always as identity primary key,
    case_no     integer not null unique,  -- independent counter from rma_masterfile_records.case_id, no FK between them
    test_bau    text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create trigger trg_lot2526_cases_updated_at
    before update on lot2526_cases
    for each row execute function set_updated_at();

alter table lot2526_cases enable row level security;

create policy lot2526_cases_select on lot2526_cases
    for select to app_role
    using (current_setting('app.role', true) in ('admin', 'engineer', 'viewer'));

create policy lot2526_cases_insert on lot2526_cases
    for insert to app_role
    with check (current_setting('app.role', true) in ('admin', 'engineer'));

create policy lot2526_cases_update on lot2526_cases
    for update to app_role
    using (current_setting('app.role', true) in ('admin', 'engineer'))
    with check (current_setting('app.role', true) in ('admin', 'engineer'));

create policy lot2526_cases_delete on lot2526_cases
    for delete to app_role
    using (current_setting('app.role', true) = 'admin');

grant select, insert, update, delete on lot2526_cases to app_role;
grant usage, select on sequence lot2526_cases_id_seq to app_role;

create table lot2526_lot_lines (
    id                            bigint generated always as identity primary key,
    case_id                       bigint not null references lot2526_cases(id) on delete cascade,
    line_order                    smallint not null,

    -- Columns B-H (Lot2526ExcelWriter._COLUMNS, test_bau lives on lot2526_cases instead - one per case, not per line)
    original_label_lot_no         text,
    date_code                     text,
    return_qty_from_dc            numeric,
    disposition_or_ss_plan_name   text,
    date_attached_ss_plan         date,
    lw                            text,

    -- Columns I-M (Lot2526ExcelWriter._LOT_CREATION_FIELDS), filled in later once the physical split happens
    date_created                  date,
    created_lot_no                text,
    created_date_code             text,
    physical_lot_qty              numeric,
    lot_code                      text,

    constraint uq_lot2526_lines_case_order unique (case_id, line_order)
);

create index idx_lot2526_lines_case on lot2526_lot_lines(case_id, line_order);

alter table lot2526_lot_lines enable row level security;

create policy lot2526_lines_select on lot2526_lot_lines
    for select to app_role
    using (current_setting('app.role', true) in ('admin', 'engineer', 'viewer'));

create policy lot2526_lines_insert on lot2526_lot_lines
    for insert to app_role
    with check (current_setting('app.role', true) in ('admin', 'engineer'));

create policy lot2526_lines_update on lot2526_lot_lines
    for update to app_role
    using (current_setting('app.role', true) in ('admin', 'engineer'))
    with check (current_setting('app.role', true) in ('admin', 'engineer'));

create policy lot2526_lines_delete on lot2526_lot_lines
    for delete to app_role
    using (current_setting('app.role', true) = 'admin');

grant select, insert, update, delete on lot2526_lot_lines to app_role;
grant usage, select on sequence lot2526_lot_lines_id_seq to app_role;

-- ---------------------------------------------------------------------
-- rma_requests (replaces requests.db.rma_requests)
-- ---------------------------------------------------------------------
create table rma_requests (
    id                      integer generated always as identity primary key,
    status                  text not null default 'New',
    requester_user_id       integer not null references users(id) on delete restrict,
    requester_username      text not null,
    requester_display_name  text not null,
    customer_name           text not null default '',
    dn_number               text not null default '',
    linked_dn_number        text,
    linked_case_id          bigint references rma_masterfile_records(id),
    fields_json             jsonb not null,
    internal_notes          text not null default '',
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create index idx_requests_status on rma_requests(status);
create index idx_requests_requester on rma_requests(requester_user_id);

create trigger trg_requests_updated_at
    before update on rma_requests
    for each row execute function set_updated_at();

alter table rma_requests enable row level security;

create policy requests_select on rma_requests
    for select to app_role
    using (
        current_setting('app.role', true) in ('admin', 'engineer')
        or (
            current_setting('app.role', true) = 'requester'
            and requester_user_id = nullif(current_setting('app.user_id', true), '')::integer
        )
    );

create policy requests_insert on rma_requests
    for insert to app_role
    with check (current_setting('app.role', true) = 'requester');

create policy requests_update on rma_requests
    for update to app_role
    using (current_setting('app.role', true) in ('admin', 'engineer'))
    with check (current_setting('app.role', true) in ('admin', 'engineer'));

-- No delete policy: no delete route exists today for requests.

grant select, insert, update on rma_requests to app_role;
grant usage, select on sequence rma_requests_id_seq to app_role;
