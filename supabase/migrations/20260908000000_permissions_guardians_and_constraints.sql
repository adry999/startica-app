-- Align database authorization with the V1 UI: educators have read-only
-- access to children and guardians. Also migrate legacy parent contacts to the
-- canonical guardians table and freeze the legacy table for a later drop.

insert into public.guardians (
  id,
  child_id,
  kindergarten_id,
  first_name,
  last_name,
  email,
  phone,
  relationship,
  is_primary,
  created_at,
  updated_at,
  created_by,
  updated_by,
  deleted_at
)
select
  p.id,
  p.child_id,
  p.kindergarten_id,
  case
    when strpos(trim(p.full_name), ' ') = 0 then trim(p.full_name)
    else left(trim(p.full_name), length(trim(p.full_name)) - strpos(reverse(trim(p.full_name)), ' '))
  end,
  case
    when strpos(trim(p.full_name), ' ') = 0 then ''
    else right(trim(p.full_name), strpos(reverse(trim(p.full_name)), ' ') - 1)
  end,
  p.email,
  p.phone,
  case lower(coalesce(p.relationship, 'guardian'))
    when 'mother' then 'mother'
    when 'father' then 'father'
    when 'guardian' then 'guardian'
    else 'other'
  end,
  false,
  p.created_at,
  p.updated_at,
  p.created_by,
  p.updated_by,
  p.deleted_at
from public.parents p
on conflict (id) do nothing;

drop policy if exists parents_insert on public.parents;
drop policy if exists parents_update on public.parents;
revoke insert, update on public.parents from authenticated;

drop policy if exists children_insert on public.children;
create policy children_insert on public.children
  for insert
  with check (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

drop policy if exists children_update on public.children;
create policy children_update on public.children
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

drop policy if exists guardians_insert on public.guardians;
create policy guardians_insert on public.guardians
  for insert
  with check (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

drop policy if exists guardians_update on public.guardians;
create policy guardians_update on public.guardians
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

update public.audit_logs
set action = case action
  when 'INSERT' then 'create'
  when 'UPDATE' then 'update'
  when 'DELETE' then 'delete'
  else lower(action)
end;

-- Constraints already exist on remote database:
-- - audit_logs_action_check
-- - groups_capacity_positive
-- - children_birth_date_valid
-- - children_name_length
-- - children_national_id_length

comment on table public.parents is
  'Deprecated read-only legacy table. Data was migrated to public.guardians in 20260908000000.';
