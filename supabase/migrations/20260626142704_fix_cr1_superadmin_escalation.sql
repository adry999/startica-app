-- Startica — CR1: close the admin→super_admin proxy-escalation path
--
-- The previous security migration blocked *self* promotion (new.id = auth.uid()).
-- An admin could still promote a puppet account to super_admin by issuing a
-- direct PostgREST PATCH on another user's row — the `users_update_admin` policy
-- permits the row, and the trigger only checked for self-updates.
--
-- Fix: extend the trigger function so that ANY authenticated session that is not
-- currently a super_admin is blocked from changing any user's role to or from
-- super_admin.  Service-role calls (auth.uid() IS NULL) remain unrestricted so
-- the invite route and future admin tooling can still operate.
--
-- The V1 design decision: super_admin accounts are created via seed SQL only.
-- No API path in V1 can promote an account to super_admin; that is intentional
-- and consistent with the bootstrap model described in CLAUDE.md.

create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role requests have auth.uid() IS NULL — always allowed.
  if auth.uid() is null then
    return new;
  end if;

  -- Self-update guard: authenticated users cannot touch role/status/deleted_at
  -- on their own row through the authenticated client.
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
  end if;

  -- Proxy-escalation guard: only a current super_admin can grant or revoke the
  -- super_admin role on ANY row (including their own, though the self-guard above
  -- already blocks that).  This closes the "admin updates puppet user" path.
  if new.role is distinct from old.role then
    if (new.role = 'super_admin' or old.role = 'super_admin') then
      if not public.is_super_admin() then
        raise exception 'only super_admin may grant or revoke the super_admin role'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- The trigger itself (trg_prevent_self_privilege_escalation) is already attached
-- to public.users from the previous migration.  Replacing the function body is
-- sufficient — no need to drop/recreate the trigger.
