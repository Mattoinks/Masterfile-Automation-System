-- Final role architecture: only admin, engineer, requester exist. Viewer is
-- removed entirely - not deprecated, not migrated to another role, gone.
-- Requesters get their own self-registration flow (backend/app changes,
-- not schema); Admin-created accounts through User Management are limited
-- to admin/engineer from here on.

-- Do not retain Viewer accounts: remove any that exist. ON DELETE CASCADE
-- on sessions.user_id takes their sessions with them; rma_requests.
-- requester_user_id is ON DELETE RESTRICT but no viewer has ever submitted
-- a request (viewers never had the submit_request permission), so this is
-- expected to be a no-op beyond the users/sessions rows themselves.
delete from users where role = 'viewer';

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
    check (role in ('admin', 'engineer', 'requester'));
