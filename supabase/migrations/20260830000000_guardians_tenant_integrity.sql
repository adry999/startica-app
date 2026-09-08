-- Close tenant-isolation and guardian-data integrity gaps.

-- The application denormalizes kindergarten_id onto children, parents, and
-- guardians for RLS performance. Keep that denormalization correct even when
-- a caller bypasses the application service layer.
create or replace function public.assert_related_tenant_matches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  related_kindergarten_id uuid;
begin
  if TG_TABLE_NAME = 'children' and new.group_id is not null then
    select kindergarten_id into related_kindergarten_id from public.groups where id = new.group_id;
  elsif TG_TABLE_NAME = 'parents' then
    select kindergarten_id into related_kindergarten_id from public.children where id = new.child_id;
  elsif TG_TABLE_NAME = 'guardians' then
    select kindergarten_id into related_kindergarten_id from public.children where id = new.child_id;
  else
    return new;
  end if;

  if related_kindergarten_id is null or related_kindergarten_id <> new.kindergarten_id then
    raise exception 'related record must belong to the same kindergarten'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists assert_children_group_tenant on public.children;
create trigger assert_children_group_tenant
  before insert or update of kindergarten_id, group_id on public.children
  for each row execute function public.assert_related_tenant_matches();

drop trigger if exists assert_parents_child_tenant on public.parents;
create trigger assert_parents_child_tenant
  before insert or update of kindergarten_id, child_id on public.parents
  for each row execute function public.assert_related_tenant_matches();

drop trigger if exists assert_guardians_child_tenant on public.guardians;
create trigger assert_guardians_child_tenant
  before insert or update of kindergarten_id, child_id on public.guardians
  for each row execute function public.assert_related_tenant_matches();

-- A child has at most one live primary guardian. The index is also the final
-- concurrency guard; the service must surface its unique-violation response.
create unique index if not exists guardians_one_live_primary_per_child
  on public.guardians (child_id)
  where is_primary and deleted_at is null;

create or replace function public.enforce_one_primary_guardian()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_primary and new.deleted_at is null then
    update public.guardians
      set is_primary = false
      where child_id = new.child_id
        and id <> new.id
        and is_primary
        and deleted_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_one_primary_guardian on public.guardians;
create trigger enforce_one_primary_guardian
  before insert or update of child_id, is_primary, deleted_at on public.guardians
  for each row execute function public.enforce_one_primary_guardian();

-- Rebuild guardians policies using the same live-user and educator-scope
-- model as children/parents. The original policies only checked membership.
drop policy if exists "guardians: read own kindergarten" on public.guardians;
drop policy if exists "guardians: insert own kindergarten" on public.guardians;
drop policy if exists "guardians: update own kindergarten" on public.guardians;

create policy guardians_select on public.guardians
  for select using (
    deleted_at is null and (
      public.is_super_admin() or (
        kindergarten_id in (select public.user_kindergarten_ids()) and (
          public.current_user_role() = 'admin' or exists (
            select 1 from public.children c
            join public.groups g on g.id = c.group_id
            where c.id = guardians.child_id and g.educator_id = auth.uid()
          )
        )
      )
    )
  );

create policy guardians_insert on public.guardians
  for insert with check (
    public.is_super_admin() or (
      kindergarten_id in (select public.user_kindergarten_ids()) and (
        public.current_user_role() = 'admin' or exists (
          select 1 from public.children c
          join public.groups g on g.id = c.group_id
          where c.id = guardians.child_id and g.educator_id = auth.uid()
        )
      )
    )
  );

create policy guardians_update on public.guardians
  for update using (
    deleted_at is null and (
      public.is_super_admin() or (
        kindergarten_id in (select public.user_kindergarten_ids()) and (
          public.current_user_role() = 'admin' or exists (
            select 1 from public.children c
            join public.groups g on g.id = c.group_id
            where c.id = guardians.child_id and g.educator_id = auth.uid()
          )
        )
      )
    )
  ) with check (
    public.is_super_admin() or (
      kindergarten_id in (select public.user_kindergarten_ids()) and (
        public.current_user_role() = 'admin' or exists (
          select 1 from public.children c
          join public.groups g on g.id = c.group_id
          where c.id = guardians.child_id and g.educator_id = auth.uid()
        )
      )
    )
  );

-- Keep the audit trigger safe if a future policy legitimately permits DELETE.
create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text;
  v_row jsonb;
  v_old jsonb;
  v_kindergarten uuid;
begin
  if auth.uid() is null then return null; end if;

  if TG_OP = 'DELETE' then
    v_row := to_jsonb(old);
    v_action := 'delete';
  else
    v_row := to_jsonb(new);
    if TG_OP = 'INSERT' then
      v_action := 'create';
    else
      v_old := to_jsonb(old);
      if (v_old->>'deleted_at') is null and (v_row->>'deleted_at') is not null then
        v_action := 'soft_delete';
      elsif (v_old->>'deleted_at') is not null and (v_row->>'deleted_at') is null then
        v_action := 'restore';
      else
        v_action := 'update';
      end if;
    end if;
  end if;

  v_kindergarten := (v_row->>'kindergarten_id')::uuid;
  insert into public.audit_logs (user_id, kindergarten_id, action, entity, entity_id)
  values (auth.uid(), v_kindergarten, v_action, TG_TABLE_NAME, (v_row->>'id')::uuid);
  return null;
end;
$$;
