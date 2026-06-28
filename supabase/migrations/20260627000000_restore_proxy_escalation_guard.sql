-- supabase/migrations/20260627000000_restore_proxy_escalation_guard.sql
--
-- Restore proxy-escalation guard dropped in 20260626210000.
--
-- Migration 20260626210000 correctly added the email self-change guard (S3)
-- but dropped the proxy-escalation guard from 20260626142704, which blocked
-- non-super_admins from granting or revoking the super_admin role on ANY row.
--
-- Without this guard an admin can promote a puppet account to super_admin by
-- issuing a direct PostgREST PATCH on another user's row — the RLS WITH CHECK
-- has no role restriction on the new row, so only the trigger was blocking it.
--
-- This migration restores the full function body with both guards present, and
-- also tightens the WITH CHECK on users_update_admin so the RLS layer provides
-- defence-in-depth (trigger is primary enforcement; RLS is belt-and-suspenders).

-- ============================================================================
-- Restore complete trigger function: self-guard (S3) + proxy-escalation guard
-- ============================================================================

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

  -- Proxy-escalation guard: only a super_admin may grant or revoke the
  -- super_admin role on ANY row. This closes the admin→puppet→super_admin
  -- elevation path. (V1 design: super_admin accounts are seed-only.)
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

-- Trigger binding is already in place from the initial security migration.
-- CREATE OR REPLACE on the function body is sufficient.

-- ============================================================================
-- Tighten WITH CHECK: admin branch must not promote target to super_admin.
-- The trigger is the primary enforcement; this adds defence-in-depth at the
-- RLS layer. Mirror the USING-clause role filter into WITH CHECK.
-- ============================================================================

drop policy users_update_admin on public.users;
create policy users_update_admin on public.users
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        users.role != 'super_admin'
        and (select public.current_user_role()) = 'admin'
        and exists (
          select 1 from public.user_kindergartens uk1
          join public.user_kindergartens uk2 on uk1.kindergarten_id = uk2.kindergarten_id
          where uk1.user_id = auth.uid() and uk2.user_id = users.id
        )
      )
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      users.role != 'super_admin'
      and (select public.current_user_role()) = 'admin'
      and exists (
        select 1 from public.user_kindergartens uk1
        join public.user_kindergartens uk2 on uk1.kindergarten_id = uk2.kindergarten_id
        where uk1.user_id = auth.uid() and uk2.user_id = users.id
      )
    )
  );
