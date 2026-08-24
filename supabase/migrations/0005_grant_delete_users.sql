-- 0001's grants on `users` deliberately omitted DELETE, since the app never
-- hard-deleted a user (deactivation via active=false covered every case at
-- the time). The Requester approval workflow adds a real one: rejecting a
-- pending (never-active) registration deletes it outright rather than
-- leaving a permanently-disabled row behind. Scoped to app_bypass_role only
-- (auth_db.py always uses that connection) - app_role still has no delete
-- grant on users, matching the original RLS policy matrix's intent
-- (users DELETE: "none (deactivation = UPDATE active=false)").

grant delete on users to app_bypass_role;
