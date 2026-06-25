-- Startica — table-level GRANTs for the `authenticated` role.
--
-- RLS policies only filter *rows*; Postgres still requires a base table
-- GRANT before any row is visible at all. The initial schema migration
-- defined RLS policies but never granted the underlying privileges, so
-- every authenticated request failed with `permission denied for table`
-- regardless of policy. Grants below mirror exactly the commands each
-- table has a policy for (no INSERT/DELETE grant where no policy exists —
-- RLS would block it anyway, but least privilege keeps the two in sync).

grant select, update on public.users to authenticated;
grant select, insert, update on public.kindergartens to authenticated;
grant select, insert, delete on public.user_kindergartens to authenticated;
grant select, insert, update on public.groups to authenticated;
grant select, insert, update on public.children to authenticated;
grant select, insert, update on public.parents to authenticated;
grant select, insert on public.audit_logs to authenticated;
