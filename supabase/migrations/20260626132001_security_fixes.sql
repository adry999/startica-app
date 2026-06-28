-- Startica — security fixes
--
-- Addresses three issues found in the 2026-06-26 audit:
--
-- 1. service_role grants (C1-adjacent): BYPASS RLS does not imply base table
--    privilege. The previous grant migration only covered `authenticated`, so
--    service-role server routes (e.g. staff invite) were getting
--    "permission denied for table users" despite holding the correct JWT.
--
-- 2. C1 — privilege escalation via self-update: `grant update on public.users
--    to authenticated` + the `users_update_self` RLS policy (row-only, no
--    column filter) let any authenticated user PATCH their own role/status/
--    deleted_at. A BEFORE UPDATE trigger blocks those column changes when
--    auth.uid() = the row being updated. Service-role calls (auth.uid() IS
--    NULL) are untouched.
--
-- 3. M2 — soft-deleted rows mutable: update policies on users/groups/
--    children/parents did not include `deleted_at IS NULL` in the USING
--    clause, allowing admins to accidentally mutate already-deleted rows.

-- ============================================================================
-- 1. service_role grants
-- ============================================================================

grant select, insert, update, delete on all tables in schema public to service_role;

-- ============================================================================
-- 2. C1 — block self-promotion via trigger
-- ============================================================================

create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only restrict authenticated-user self-updates (auth.uid() is null for
  -- service-role requests, which are always allowed to change these fields).
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
  end if;
  return new;
end;
$$;

create trigger trg_prevent_self_privilege_escalation
  before update on public.users
  for each row execute function public.prevent_self_privilege_escalation();

-- ============================================================================
-- 3. M2 — add deleted_at IS NULL to update policy USING clauses
--    (recreate policies; DROP + CREATE is the only way to replace a policy)
-- ============================================================================

-- users: self-update
drop policy users_update_self on public.users;
create policy users_update_self on public.users
  for update
  using (id = auth.uid() and deleted_at is null)
  with check (id = auth.uid());

-- users: admin update of others
drop policy users_update_admin on public.users;
create policy users_update_admin on public.users
  for update
  using (
    deleted_at is null
    and (
      public.is_super_admin()
      or (
        public.current_user_role() = 'admin'
        and exists (
          select 1 from public.user_kindergartens uk1
          join public.user_kindergartens uk2 on uk1.kindergarten_id = uk2.kindergarten_id
          where uk1.user_id = auth.uid() and uk2.user_id = users.id
        )
      )
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.current_user_role() = 'admin'
      and exists (
        select 1 from public.user_kindergartens uk1
        join public.user_kindergartens uk2 on uk1.kindergarten_id = uk2.kindergarten_id
        where uk1.user_id = auth.uid() and uk2.user_id = users.id
      )
    )
  );

-- groups
drop policy groups_update on public.groups;
create policy groups_update on public.groups
  for update
  using (
    deleted_at is null
    and (
      public.is_super_admin()
      or (
        public.current_user_role() = 'admin'
        and kindergarten_id in (select public.user_kindergarten_ids())
      )
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.current_user_role() = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

-- children
drop policy children_update on public.children;
create policy children_update on public.children
  for update
  using (
    deleted_at is null
    and (
      public.is_super_admin()
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          public.current_user_role() = 'admin'
          or (
            public.current_user_role() = 'educator'
            and group_id in (select id from public.groups where educator_id = auth.uid())
          )
        )
      )
    )
  )
  with check (
    public.is_super_admin()
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        public.current_user_role() = 'admin'
        or (
          public.current_user_role() = 'educator'
          and group_id in (select id from public.groups where educator_id = auth.uid())
        )
      )
    )
  );

-- parents
drop policy parents_update on public.parents;
create policy parents_update on public.parents
  for update
  using (
    deleted_at is null
    and (
      public.is_super_admin()
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          public.current_user_role() = 'admin'
          or exists (
            select 1 from public.children c
            join public.groups g on g.id = c.group_id
            where c.id = parents.child_id and g.educator_id = auth.uid()
          )
        )
      )
    )
  )
  with check (
    public.is_super_admin()
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        public.current_user_role() = 'admin'
        or exists (
          select 1 from public.children c
          join public.groups g on g.id = c.group_id
          where c.id = parents.child_id and g.educator_id = auth.uid()
        )
      )
    )
  );
