-- Grant table-level privileges for the guardians table to the authenticated role.
-- RLS policies only filter rows; Postgres still requires a base GRANT first.
-- Matches the SELECT/INSERT/UPDATE RLS policies defined in 20260629100000.
-- No DELETE grant — soft delete is handled via UPDATE (setting deleted_at).

grant select, insert, update on public.guardians to authenticated;
