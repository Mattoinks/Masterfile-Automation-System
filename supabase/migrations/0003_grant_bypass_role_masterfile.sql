-- Phase 1, Track B: the masterfile dual-write (excel_service.py,
-- lot2526/excel_writer.py) also uses app_bypass_role, for the same reason
-- Track A's RequestsDB does - see backend/app/services/db.py's docstring.
-- processing_service.py/record_service.py only carry a raw username string
-- at their call sites today (the confirmed _role()/_role_from_user() bug
-- the plan's Phase 4 fixes), not a real role object, so there's no clean
-- role to key RLS off without a caller-signature change the plan rules out.
-- FastAPI's require_perm() remains the actual enforcement, unchanged from
-- today - same reasoning as 0002, just for the masterfile tables.

grant select, insert, update, delete on rma_masterfile_records to app_bypass_role;
grant usage, select on sequence rma_masterfile_records_id_seq to app_bypass_role;

grant select, insert, update, delete on lot2526_cases to app_bypass_role;
grant usage, select on sequence lot2526_cases_id_seq to app_bypass_role;
grant select, insert, update, delete on lot2526_lot_lines to app_bypass_role;
grant usage, select on sequence lot2526_lot_lines_id_seq to app_bypass_role;
