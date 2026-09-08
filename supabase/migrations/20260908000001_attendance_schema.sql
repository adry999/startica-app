-- Attendance tracking schema for daily group/individual check-ins
-- Status: present, absent, excused, sick

create type attendance_status as enum ('present', 'absent', 'excused', 'sick');

create table attendance (
  id uuid primary key default gen_random_uuid(),
  kindergarten_id uuid not null references kindergartens(id) on delete cascade,
  group_id uuid references groups(id) on delete set null,
  child_id uuid not null references children(id) on delete cascade,
  date date not null,
  status attendance_status not null,
  marked_by uuid not null references users(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id) on delete restrict,
  updated_by uuid not null references users(id) on delete restrict,
  deleted_at timestamptz,
  unique(kindergarten_id, child_id, date) -- one record per child per day
);

create index idx_attendance_kindergarten_date on attendance(kindergarten_id, date) where deleted_at is null;
create index idx_attendance_group_date on attendance(group_id, date) where deleted_at is null;
create index idx_attendance_child on attendance(child_id) where deleted_at is null;

-- RLS: educators can mark attendance for children in their groups/kindergarten
alter table attendance enable row level security;

create policy attendance_list_own_kindergarten on attendance
  for select
  using (
    kindergarten_id in (
      select kindergarten_id from user_kindergartens where user_id = auth.uid()
    )
    and deleted_at is null
  );

create policy attendance_create_own_kindergarten on attendance
  for insert
  with check (
    kindergarten_id in (
      select kindergarten_id from user_kindergartens where user_id = auth.uid()
    )
  );

create policy attendance_update_own_kindergarten on attendance
  for update
  using (
    kindergarten_id in (
      select kindergarten_id from user_kindergartens where user_id = auth.uid()
    )
    and deleted_at is null
  )
  with check (
    kindergarten_id in (
      select kindergarten_id from user_kindergartens where user_id = auth.uid()
    )
  );

-- Audit log trigger for soft deletes
create trigger trg_attendance_audit_log
  after delete on attendance
  for each row
  execute function fn_audit_log_soft_delete('attendance');

-- Update trigger for updated_at
create trigger trg_attendance_updated_at
  before update on attendance
  for each row
  execute function fn_update_timestamp();

-- Grant privileges to service role (for seed/migrations)
grant select, insert, update, delete on attendance to service_role;
