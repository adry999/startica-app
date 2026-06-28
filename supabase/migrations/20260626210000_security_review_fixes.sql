-- supabase/migrations/20260626210000_security_review_fixes.sql
--
-- S1: Prevent non-super_admins from modifying super_admin rows.
--     The admin branch of users_update_admin now excludes rows where
--     the target's current role is super_admin.
-- S3: Block authenticated users from changing their own email via
--     the public.users table (would desync from auth.users.email).
--     Extends prevent_self_privilege_escalation trigger.
-- P1-partial: Wrap bare is_super_admin()/current_user_role() in (select …)
--     in users_update_admin so the planner hoists them to once-per-statement
--     InitPlans instead of re-evaluating per scanned row.

-- ============================================================================
-- S3: extend trigger to block self-email changes
-- ============================================================================

create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role writes (auth.uid() IS NULL) bypass all checks — intentional.
  if auth.uid() is not null and new.id = auth.uid() then
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
  return new;
end;
$$;

-- Trigger already exists from security_fixes migration; replace function only
-- (CREATE OR REPLACE above is sufficient — the trigger binding is unchanged).

-- ============================================================================
-- S1 + P1: recreate users_update_admin
--   - admin branch now excludes rows where users.role = 'super_admin'
--   - wrap bare helper calls in (select …) for planner hoisting
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
      (select public.current_user_role()) = 'admin'
      and exists (
        select 1 from public.user_kindergartens uk1
        join public.user_kindergartens uk2 on uk1.kindergarten_id = uk2.kindergarten_id
        where uk1.user_id = auth.uid() and uk2.user_id = users.id
      )
    )
  );
