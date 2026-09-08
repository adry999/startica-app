-- Pool module (Bazin): trainer availability, recurring schedule patterns,
-- generated session instances, per-session child participants.
-- See docs/superpowers/specs/2026-07-04-pool-module-design.md.

create table public.pool_trainer_availability (
  id              uuid        primary key default gen_random_uuid(),
  kindergarten_id uuid        not null references public.kindergartens (id) on delete restrict,
  trainer_user_id uuid        not null references public.users (id),
  weekday         smallint    not null check (weekday between 0 and 6),
  start_time      time        not null,
  end_time        time        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        references public.users (id),
  updated_by      uuid        references public.users (id),
  deleted_at      timestamptz,
  constraint pool_trainer_availability_time_order check (start_time < end_time)
);

create trigger trg_pool_trainer_availability_set_updated_at
  before update on public.pool_trainer_availability
  for each row execute function public.set_updated_at();

create trigger trg_pool_trainer_availability_audit_columns
  before insert or update on public.pool_trainer_availability
  for each row execute function public.set_audit_columns();

create trigger trg_pool_trainer_availability_audit_log
  after insert or update on public.pool_trainer_availability
  for each row execute function public.write_audit_log();

create table public.pool_schedule_patterns (
  id                uuid        primary key default gen_random_uuid(),
  kindergarten_id   uuid        not null references public.kindergartens (id) on delete restrict,
  trainer_user_id   uuid        not null references public.users (id),
  weekday           smallint    not null check (weekday between 0 and 6),
  start_time        time        not null,
  end_time          time        not null,
  default_group_id  uuid        references public.groups (id),
  capacity          integer     not null check (capacity > 0),
  active_from       date        not null,
  active_until      date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid        references public.users (id),
  updated_by        uuid        references public.users (id),
  deleted_at        timestamptz,
  constraint pool_schedule_patterns_time_order check (start_time < end_time),
  constraint pool_schedule_patterns_date_order check (active_until is null or active_until >= active_from)
);

create trigger trg_pool_schedule_patterns_set_updated_at
  before update on public.pool_schedule_patterns
  for each row execute function public.set_updated_at();

create trigger trg_pool_schedule_patterns_audit_columns
  before insert or update on public.pool_schedule_patterns
  for each row execute function public.set_audit_columns();

create trigger trg_pool_schedule_patterns_audit_log
  after insert or update on public.pool_schedule_patterns
  for each row execute function public.write_audit_log();

create table public.pool_sessions (
  id                uuid        primary key default gen_random_uuid(),
  kindergarten_id   uuid        not null references public.kindergartens (id) on delete restrict,
  trainer_user_id   uuid        not null references public.users (id),
  source_pattern_id uuid        references public.pool_schedule_patterns (id),
  session_date      date        not null,
  start_time        time        not null,
  end_time          time        not null,
  capacity          integer     not null check (capacity > 0),
  group_id          uuid        references public.groups (id),
  status            text        not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid        references public.users (id),
  updated_by        uuid        references public.users (id),
  deleted_at        timestamptz,
  constraint pool_sessions_time_order check (start_time < end_time)
);

-- Prevents re-generating the same instance twice for the same pattern+date.
create unique index pool_sessions_pattern_date_unique
  on public.pool_sessions (source_pattern_id, session_date)
  where source_pattern_id is not null and deleted_at is null;

create trigger trg_pool_sessions_set_updated_at
  before update on public.pool_sessions
  for each row execute function public.set_updated_at();

create trigger trg_pool_sessions_audit_columns
  before insert or update on public.pool_sessions
  for each row execute function public.set_audit_columns();

create trigger trg_pool_sessions_audit_log
  after insert or update on public.pool_sessions
  for each row execute function public.write_audit_log();

-- kindergarten_id is denormalized from the session (same rationale as
-- children/parents/guardians: keeps RLS flat/fast, no join needed for tenant scoping).
create table public.pool_session_participants (
  id              uuid        primary key default gen_random_uuid(),
  session_id      uuid        not null references public.pool_sessions (id) on delete cascade,
  kindergarten_id uuid        not null references public.kindergartens (id) on delete restrict,
  child_id        uuid        not null references public.children (id),
  status          text        not null default 'enrolled' check (status in ('enrolled', 'removed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        references public.users (id),
  updated_by      uuid        references public.users (id),
  deleted_at      timestamptz
);

create unique index pool_session_participants_unique_active
  on public.pool_session_participants (session_id, child_id)
  where deleted_at is null and status = 'enrolled';

create trigger trg_pool_session_participants_set_updated_at
  before update on public.pool_session_participants
  for each row execute function public.set_updated_at();

create trigger trg_pool_session_participants_audit_columns
  before insert or update on public.pool_session_participants
  for each row execute function public.set_audit_columns();

create trigger trg_pool_session_participants_audit_log
  after insert or update on public.pool_session_participants
  for each row execute function public.write_audit_log();

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.pool_trainer_availability enable row level security;
alter table public.pool_schedule_patterns enable row level security;
alter table public.pool_sessions enable row level security;
alter table public.pool_session_participants enable row level security;

-- pool_trainer_availability: read by admin/super_admin (kg-scoped) or the trainer themself.
-- Write by admin/super_admin (kg-scoped) or the trainer themself.
create policy pool_trainer_availability_select on public.pool_trainer_availability
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or trainer_user_id = auth.uid()
        )
      )
    )
  );

create policy pool_trainer_availability_insert on public.pool_trainer_availability
  for insert
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or trainer_user_id = auth.uid()
      )
    )
  );

create policy pool_trainer_availability_update on public.pool_trainer_availability
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or trainer_user_id = auth.uid()
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
        or trainer_user_id = auth.uid()
      )
    )
  );

-- pool_schedule_patterns: same shape as availability.
create policy pool_schedule_patterns_select on public.pool_schedule_patterns
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or trainer_user_id = auth.uid()
        )
      )
    )
  );

create policy pool_schedule_patterns_insert on public.pool_schedule_patterns
  for insert
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or trainer_user_id = auth.uid()
      )
    )
  );

create policy pool_schedule_patterns_update on public.pool_schedule_patterns
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or trainer_user_id = auth.uid()
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
        or trainer_user_id = auth.uid()
      )
    )
  );

-- pool_sessions: same shape.
create policy pool_sessions_select on public.pool_sessions
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or trainer_user_id = auth.uid()
        )
      )
    )
  );

create policy pool_sessions_insert on public.pool_sessions
  for insert
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or trainer_user_id = auth.uid()
      )
    )
  );

create policy pool_sessions_update on public.pool_sessions
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or trainer_user_id = auth.uid()
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
        or trainer_user_id = auth.uid()
      )
    )
  );

-- pool_session_participants: kindergarten_id is denormalized so no join is
-- needed for tenant scoping, but the trainer check still needs the parent
-- session's trainer_user_id (same join style as parents_select via children/groups).
create policy pool_session_participants_select on public.pool_session_participants
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
            select 1 from public.pool_sessions s
            where s.id = pool_session_participants.session_id
              and s.trainer_user_id = auth.uid()
          )
        )
      )
    )
  );

create policy pool_session_participants_insert on public.pool_session_participants
  for insert
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or exists (
          select 1 from public.pool_sessions s
          where s.id = pool_session_participants.session_id
            and s.trainer_user_id = auth.uid()
        )
      )
    )
  );

create policy pool_session_participants_update on public.pool_session_participants
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
            select 1 from public.pool_sessions s
            where s.id = pool_session_participants.session_id
              and s.trainer_user_id = auth.uid()
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
          select 1 from public.pool_sessions s
          where s.id = pool_session_participants.session_id
            and s.trainer_user_id = auth.uid()
        )
      )
    )
  );

-- ============================================================================
-- GRANTs — table-level, mirroring the RLS policies (select/insert/update only,
-- no delete: soft delete is an UPDATE). service_role also needs an explicit
-- grant since `grant ... on all tables in schema public to service_role`
-- (20260626132001) only covered tables that existed at that time.
-- ============================================================================

grant select, insert, update on public.pool_trainer_availability to authenticated;
grant select, insert, update on public.pool_schedule_patterns to authenticated;
grant select, insert, update on public.pool_sessions to authenticated;
grant select, insert, update on public.pool_session_participants to authenticated;

grant select, insert, update, delete on public.pool_trainer_availability to service_role;
grant select, insert, update, delete on public.pool_schedule_patterns to service_role;
grant select, insert, update, delete on public.pool_sessions to service_role;
grant select, insert, update, delete on public.pool_session_participants to service_role;
