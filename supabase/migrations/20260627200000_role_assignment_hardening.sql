-- 20260627200000_role_assignment_hardening.sql
--
-- Closes Security H2 + H3 at the DB layer:
--   H2: extend prevent_self_privilege_escalation so only super_admin may change
--       role on ANY row (was: only super_admin grants/revokes were blocked).
--   H3: tighten user_kindergartens_insert — remove admin clause.
--       All admin staff additions go through the service-role invite route
--       which bypasses RLS; no authenticated-client path for admin inserts exists.

-- ── 1) Extend trigger ────────────────────────────────────────────────────────

create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role writes (auth.uid() IS NULL) bypass all checks — intentional.
  if auth.uid() is null then
    return new;
  end if;

  -- Self-update guard: authenticated users cannot change their own
  -- role/status/deleted_at/email via the public.users table.
  if new.id = auth.uid() then
    if new.role is distinct from old.role then
      raise exception 'cannot change own role' using errcode = 'insufficient_privilege';
    end if;
    if new.status is distinct from old.status then
      raise exception 'cannot change own status' using errcode = 'insufficient_privilege';
    end if;
    if new.deleted_at is distinct from old.deleted_at then
      raise exception 'cannot change own deleted_at' using errcode = 'insufficient_privilege';
    end if;
    if new.email is distinct from old.email then
      raise exception 'cannot change own email' using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Role-change guard: only super_admin may change role on ANY row.
  -- This closes the admin→admin-promotion path (H2) and supersedes the
  -- narrower "super_admin grant/revoke" check from 20260627000000.
  if new.role is distinct from old.role then
    if not public.is_super_admin() then
      raise exception 'only super_admin may change user roles'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

-- ── 2) Tighten user_kindergartens_insert ────────────────────────────────────
-- Remove the admin clause: there is no legitimate authenticated-client INSERT
-- path for admins. All staff additions go through the service-role invite route.

drop policy user_kindergartens_insert on public.user_kindergartens;
create policy user_kindergartens_insert on public.user_kindergartens
  for insert
  with check ((select public.is_super_admin()));
