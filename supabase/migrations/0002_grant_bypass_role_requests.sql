-- Phase 1, Track A follow-up: RequestsDB (like AuthDB) uses app_bypass_role
-- for all its operations, not app_role - see the docstring at the top of
-- backend/app/services/db.py for why (request_routes.py's call sites don't
-- carry role/user_id context through to RequestsDB, and the plan requires
-- zero changes to those callers). 0001 only granted app_bypass_role access
-- to users/sessions; this closes the gap for rma_requests, found by actually
-- running RequestsDB against the live project rather than assuming the
-- first migration covered it.

grant select, insert, update on rma_requests to app_bypass_role;
grant usage, select on sequence rma_requests_id_seq to app_bypass_role;
