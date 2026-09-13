-- Keep every denormalized kindergarten_id aligned with its related row.
-- These constraints deliberately validate existing data: a deployment must stop
-- for an existing cross-tenant relation rather than silently rewriting records.

alter table public.children
  add constraint children_id_kindergarten_id_key unique (id, kindergarten_id);
alter table public.groups
  add constraint groups_id_kindergarten_id_key unique (id, kindergarten_id);
alter table public.invoices
  add constraint invoices_id_kindergarten_id_key unique (id, kindergarten_id);

alter table public.invoices
  drop constraint invoices_child_id_fkey,
  add constraint invoices_child_id_fkey
    foreign key (child_id, kindergarten_id)
    references public.children (id, kindergarten_id);

alter table public.payments
  drop constraint payments_invoice_id_fkey,
  add constraint payments_invoice_id_fkey
    foreign key (invoice_id, kindergarten_id)
    references public.invoices (id, kindergarten_id)
    on delete cascade;

alter table public.attendance
  drop constraint attendance_child_id_fkey,
  drop constraint attendance_group_id_fkey,
  add constraint attendance_child_id_fkey
    foreign key (child_id, kindergarten_id)
    references public.children (id, kindergarten_id)
    on delete cascade,
  add constraint attendance_group_id_fkey
    foreign key (group_id, kindergarten_id)
    references public.groups (id, kindergarten_id)
    on delete set null (group_id);

-- Attendance is only visible and mutable for an active super admin, an admin
-- assigned to the row's kindergarten, or the educator assigned to the row's
-- live group. The child check prevents a forged group_id from widening an
-- educator's access.
drop policy attendance_list_own_kindergarten on public.attendance;
drop policy attendance_create_own_kindergarten on public.attendance;
drop policy attendance_update_own_kindergarten on public.attendance;

create policy attendance_list_own_kindergarten on public.attendance
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        (select public.current_user_role()) = 'admin'
        and kindergarten_id in (select public.user_kindergarten_ids())
      )
      or (
        (select public.current_user_role()) = 'educator'
        and kindergarten_id in (select public.user_kindergarten_ids())
        and exists (
          select 1
          from public.groups g
          join public.children c on c.id = attendance.child_id
          where g.id = attendance.group_id
            and g.kindergarten_id = attendance.kindergarten_id
            and g.educator_id = auth.uid()
            and g.status = 'active'
            and g.deleted_at is null
            and c.kindergarten_id = attendance.kindergarten_id
            and c.group_id = g.id
            and c.deleted_at is null
        )
      )
    )
  );

create policy attendance_create_own_kindergarten on public.attendance
  for insert
  with check (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
    or (
      (select public.current_user_role()) = 'educator'
      and kindergarten_id in (select public.user_kindergarten_ids())
      and exists (
        select 1
        from public.groups g
        join public.children c on c.id = attendance.child_id
        where g.id = attendance.group_id
          and g.kindergarten_id = attendance.kindergarten_id
          and g.educator_id = auth.uid()
          and g.status = 'active'
          and g.deleted_at is null
          and c.kindergarten_id = attendance.kindergarten_id
          and c.group_id = g.id
          and c.deleted_at is null
      )
    )
  );

create policy attendance_update_own_kindergarten on public.attendance
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        (select public.current_user_role()) = 'admin'
        and kindergarten_id in (select public.user_kindergarten_ids())
      )
      or (
        (select public.current_user_role()) = 'educator'
        and kindergarten_id in (select public.user_kindergarten_ids())
        and exists (
          select 1 from public.groups g join public.children c on c.id = attendance.child_id
          where g.id = attendance.group_id and g.kindergarten_id = attendance.kindergarten_id
            and g.educator_id = auth.uid() and g.status = 'active' and g.deleted_at is null
            and c.kindergarten_id = attendance.kindergarten_id and c.group_id = g.id and c.deleted_at is null
        )
      )
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
    or (
      (select public.current_user_role()) = 'educator'
      and kindergarten_id in (select public.user_kindergarten_ids())
      and exists (
        select 1 from public.groups g join public.children c on c.id = attendance.child_id
        where g.id = attendance.group_id and g.kindergarten_id = attendance.kindergarten_id
          and g.educator_id = auth.uid() and g.status = 'active' and g.deleted_at is null
          and c.kindergarten_id = attendance.kindergarten_id and c.group_id = g.id and c.deleted_at is null
      )
    )
  );

grant select, insert, update on public.attendance to authenticated;
