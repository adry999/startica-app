-- Fix: inserting a guardian always fails with
--   ERROR: record "new" has no field "group_id" (SQLSTATE 42703)
--
-- assert_related_tenant_matches() guarded the children branch with
--
--   if TG_TABLE_NAME = 'children' and new.group_id is not null then
--
-- PL/pgSQL hands that whole condition to the SQL executor as a single
-- expression, so `new.group_id` is resolved regardless of the TG_TABLE_NAME
-- comparison. There is no short-circuit. On public.guardians and
-- public.parents the NEW record has no group_id column, so every INSERT and
-- every UPDATE of kindergarten_id/child_id aborts -- including the ones the
-- app makes through guardians.service.ts.
--
-- Splitting the table check into an outer IF keeps new.group_id out of the
-- expression on any table that does not have it. Behaviour is otherwise
-- unchanged: a child's group must belong to the child's kindergarten, and a
-- parent/guardian must belong to their child's kindergarten.

create or replace function public.assert_related_tenant_matches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  related_kindergarten_id uuid;
begin
  if TG_TABLE_NAME = 'children' then
    -- A child with no group has nothing to cross-check.
    if new.group_id is null then
      return new;
    end if;
    select kindergarten_id into related_kindergarten_id
    from public.groups where id = new.group_id;

  elsif TG_TABLE_NAME in ('parents', 'guardians') then
    select kindergarten_id into related_kindergarten_id
    from public.children where id = new.child_id;

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
