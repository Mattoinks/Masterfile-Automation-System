-- 0001/0002's grants on `rma_requests` deliberately omitted DELETE (select,
-- insert, update only), since the app itself never hard-deletes a request -
-- status changes cover every normal case. A real, occasional need for it
-- exists outside the app though: resetting a test/staging environment back
-- to a clean slate (no requests, no masterfile data, one admin account)
-- between testing rounds. Scoped to app_bypass_role only, same rationale as
-- 0005's grant on users - app_role still has no delete grant on
-- rma_requests, matching the original RLS policy matrix's intent for
-- normal application traffic.

grant delete on rma_requests to app_bypass_role;
