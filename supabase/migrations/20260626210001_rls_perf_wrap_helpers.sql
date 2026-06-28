-- supabase/migrations/20260626210001_rls_perf_wrap_helpers.sql
--
-- Wrap bare is_super_admin() / current_user_role() calls in (select …) so the
-- Postgres planner treats them as InitPlans (evaluated once per statement) rather
-- than per-row volatile calls.
-- Covers all policies NOT already recreated in 20260626210000.

-- users_select
drop policy users_select on public.users;
create policy users_select on public.users
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or id = auth.uid()
      or (
        (select public.current_user_role()) = 'admin'
        and exists (
          select 1 from public.user_kindergartens uk1
          join public.user_kindergartens uk2 on uk1.kindergarten_id = uk2.kindergarten_id
          where uk1.user_id = auth.uid() and uk2.user_id = users.id
        )
      )
    )
  );

-- kindergartens_select
drop policy kindergartens_select on public.kindergartens;
create policy kindergartens_select on public.kindergartens
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or id in (select public.user_kindergarten_ids())
    )
  );

-- kindergartens_insert
drop policy kindergartens_insert on public.kindergartens;
create policy kindergartens_insert on public.kindergartens
  for insert
  with check ((select public.is_super_admin()));

-- kindergartens_update
drop policy kindergartens_update on public.kindergartens;
create policy kindergartens_update on public.kindergartens
  for update
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- user_kindergartens_select
drop policy user_kindergartens_select on public.user_kindergartens;
create policy user_kindergartens_select on public.user_kindergartens
  for select
  using (
    (select public.is_super_admin())
    or user_id = auth.uid()
    or kindergarten_id in (select public.user_kindergarten_ids())
  );

-- user_kindergartens_insert
drop policy user_kindergartens_insert on public.user_kindergartens;
create policy user_kindergartens_insert on public.user_kindergartens
  for insert
  with check (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

-- user_kindergartens_delete
drop policy user_kindergartens_delete on public.user_kindergartens;
create policy user_kindergartens_delete on public.user_kindergartens
  for delete
  using (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

-- groups_select
drop policy groups_select on public.groups;
create policy groups_select on public.groups
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or educator_id = auth.uid()
        )
      )
    )
  );

-- groups_insert
drop policy groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert
  with check (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

-- groups_update (recreated in security_fixes but still bare)
drop policy groups_update on public.groups;
create policy groups_update on public.groups
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        (select public.current_user_role()) = 'admin'
        and kindergarten_id in (select public.user_kindergarten_ids())
      )
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

-- children_select
drop policy children_select on public.children;
create policy children_select on public.children
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or group_id in (select id from public.groups where educator_id = auth.uid())
        )
      )
    )
  );

-- children_insert
drop policy children_insert on public.children;
create policy children_insert on public.children
  for insert
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or (
          (select public.current_user_role()) = 'educator'
          and group_id in (select id from public.groups where educator_id = auth.uid())
        )
      )
    )
  );

-- children_update (recreated in security_fixes but still bare)
drop policy children_update on public.children;
create policy children_update on public.children
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or (
            (select public.current_user_role()) = 'educator'
            and group_id in (select id from public.groups where educator_id = auth.uid())
          )
        )
      )
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or (
          (select public.current_user_role()) = 'educator'
          and group_id in (select id from public.groups where educator_id = auth.uid())
        )
      )
    )
  );

-- parents_select
drop policy parents_select on public.parents;
create policy parents_select on public.parents
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or exists (
            select 1 from public.children c
            join public.groups g on g.id = c.group_id
            where c.id = parents.child_id and g.educator_id = auth.uid()
          )
        )
      )
    )
  );

-- parents_insert
drop policy parents_insert on public.parents;
create policy parents_insert on public.parents
  for insert
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or exists (
          select 1 from public.children c
          join public.groups g on g.id = c.group_id
          where c.id = parents.child_id and g.educator_id = auth.uid()
        )
      )
    )
  );

-- parents_update (recreated in security_fixes but still bare)
drop policy parents_update on public.parents;
create policy parents_update on public.parents
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
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
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or exists (
          select 1 from public.children c
          join public.groups g on g.id = c.group_id
          where c.id = parents.child_id and g.educator_id = auth.uid()
        )
      )
    )
  );
