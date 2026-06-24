-- Startica — initial schema
-- Tables: kindergartens, users, user_kindergartens, groups, children, parents, audit_logs
-- (attendance is deferred to its own module/migration — see CLAUDE.md / GETTING_STARTED.md)
--
-- Cross-cutting rules applied here (CLAUDE.md, non-negotiable):
--   * every business table: kindergarten_id (where applicable) + created_at/updated_at/
--     created_by/updated_by + deleted_at (soft delete) — audit_logs is the documented exception
--   * RLS enabled on every table, Super Admin bypass, scoped via user_kindergartens,
--     reads filter deleted_at IS NULL
--   * no hard DELETE on business data: no DELETE policy is defined for business tables,
--     so the only way to remove a row through the API is UPDATE deleted_at = now()

create extension if not exists pgcrypto;

-- ============================================================================
-- ENUMS
-- ============================================================================

-- 'parent' and 'child' are reserved for V2 (see CLAUDE.md "Future roles") —
-- not used by any V1 code path, but shaped into the enum now since adding
-- enum values later is cheap and retrofitting authorization is not.
create type public.user_role as enum ('super_admin', 'admin', 'educator', 'parent', 'child');
create type public.user_status as enum ('active', 'inactive');
create type public.kindergarten_status as enum ('active', 'suspended');
create type public.group_status as enum ('active', 'archived');
create type public.child_status as enum ('enrolled', 'withdrawn', 'graduated');
create type public.national_id_type as enum ('CNP', 'IDNP');

-- ============================================================================
-- TRIGGER FUNCTION — updated_at
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- TABLES
-- ============================================================================

-- users — mirrors auth.users 1:1. Global identity; tenant scope comes from
-- user_kindergartens, so (intentionally) no kindergarten_id column here.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.user_role not null default 'educator',
  avatar_url text,
  status public.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id),
  updated_by uuid references public.users (id),
  deleted_at timestamptz
);

create trigger trg_users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- kindergartens — tenant root.
create table public.kindergartens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  phone text,
  logo_url text,
  status public.kindergarten_status not null default 'active',
  settings jsonb not null default '{}'::jsonb, -- timezone, default_locale, working_hours, contact
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id),
  updated_by uuid references public.users (id),
  deleted_at timestamptz
);

create trigger trg_kindergartens_set_updated_at
  before update on public.kindergartens
  for each row execute function public.set_updated_at();

-- user_kindergartens — many-to-many access grant, not business data:
-- removing access is a real DELETE, no soft delete / updated_at needed.
create table public.user_kindergartens (
  user_id uuid not null references public.users (id) on delete cascade,
  kindergarten_id uuid not null references public.kindergartens (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id),
  primary key (user_id, kindergarten_id)
);

-- groups
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  kindergarten_id uuid not null references public.kindergartens (id) on delete restrict,
  name text not null,
  age_range text,
  educator_id uuid references public.users (id) on delete set null,
  status public.group_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id),
  updated_by uuid references public.users (id),
  deleted_at timestamptz
);

create trigger trg_groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

-- children — kindergarten_id is denormalized (also reachable via group_id)
-- so RLS policies stay flat/fast without a join. The service layer is
-- responsible for keeping child.kindergarten_id == group.kindergarten_id.
-- age / zodiac_sign are derived from birth_date in shared/utils — never stored.
create table public.children (
  id uuid primary key default gen_random_uuid(),
  kindergarten_id uuid not null references public.kindergartens (id) on delete restrict,
  group_id uuid references public.groups (id) on delete set null,
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  blood_group text,
  allergies text,
  medical_notes text,
  national_id text,
  id_type public.national_id_type,
  status public.child_status not null default 'enrolled',
  consent jsonb not null default '{}'::jsonb, -- GDPR: what consent, when, from whom
  retention_until date, -- GDPR: anonymize/delete after this date (separate service path)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id),
  updated_by uuid references public.users (id),
  deleted_at timestamptz,
  constraint children_national_id_requires_type
    check (national_id is null or id_type is not null)
);

create trigger trg_children_set_updated_at
  before update on public.children
  for each row execute function public.set_updated_at();

-- parents — contacts for a child (1:many). kindergarten_id is denormalized
-- from the child for the same flat-RLS reason as children.kindergarten_id.
create table public.parents (
  id uuid primary key default gen_random_uuid(),
  kindergarten_id uuid not null references public.kindergartens (id) on delete restrict,
  child_id uuid not null references public.children (id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  relationship text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users (id),
  updated_by uuid references public.users (id),
  deleted_at timestamptz
);

create trigger trg_parents_set_updated_at
  before update on public.parents
  for each row execute function public.set_updated_at();

-- audit_logs — append-only, explicitly exempt from soft delete / updated_at.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  kindergarten_id uuid references public.kindergartens (id),
  action text not null,
  entity text not null,
  entity_id uuid,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_users_deleted_at on public.users (deleted_at);
create index idx_users_role on public.users (role);

create index idx_kindergartens_deleted_at on public.kindergartens (deleted_at);
create index idx_kindergartens_status on public.kindergartens (status);

create index idx_user_kindergartens_kindergarten_id on public.user_kindergartens (kindergarten_id);

create index idx_groups_kindergarten_id_deleted_at on public.groups (kindergarten_id, deleted_at);
create index idx_groups_educator_id on public.groups (educator_id);

create index idx_children_kindergarten_id_deleted_at on public.children (kindergarten_id, deleted_at);
create index idx_children_group_id on public.children (group_id);

create index idx_parents_kindergarten_id_deleted_at on public.parents (kindergarten_id, deleted_at);
create index idx_parents_child_id on public.parents (child_id);

create index idx_audit_logs_kindergarten_id on public.audit_logs (kindergarten_id);
create index idx_audit_logs_user_id on public.audit_logs (user_id);
create index idx_audit_logs_entity on public.audit_logs (entity, entity_id);

-- ============================================================================
-- RLS HELPER FUNCTIONS (security definer — avoid RLS recursion on public.users)
-- ============================================================================

create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function public.user_kindergarten_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select kindergarten_id from public.user_kindergartens where user_id = auth.uid();
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.users enable row level security;
alter table public.kindergartens enable row level security;
alter table public.user_kindergartens enable row level security;
alter table public.groups enable row level security;
alter table public.children enable row level security;
alter table public.parents enable row level security;
alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

-- Everyone sees their own profile + super admin sees all + admin sees
-- co-workers that share at least one kindergarten with them.
create policy users_select on public.users
  for select
  using (
    deleted_at is null
    and (
      public.is_super_admin()
      or id = auth.uid()
      or (
        public.current_user_role() = 'admin'
        and exists (
          select 1 from public.user_kindergartens uk1
          join public.user_kindergartens uk2 on uk1.kindergarten_id = uk2.kindergarten_id
          where uk1.user_id = auth.uid() and uk2.user_id = users.id
        )
      )
    )
  );

-- No INSERT policy: staff accounts are created server-side (service role,
-- which bypasses RLS) as part of the invite flow — never a direct client insert.

create policy users_update_self on public.users
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy users_update_admin on public.users
  for update
  using (
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

-- ---------------------------------------------------------------------------
-- kindergartens — management is Super Admin only; admin/educator can read
-- the kindergartens they belong to.
-- ---------------------------------------------------------------------------

create policy kindergartens_select on public.kindergartens
  for select
  using (
    deleted_at is null
    and (
      public.is_super_admin()
      or id in (select public.user_kindergarten_ids())
    )
  );

create policy kindergartens_insert on public.kindergartens
  for insert
  with check (public.is_super_admin());

create policy kindergartens_update on public.kindergartens
  for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- user_kindergartens — access grants, managed by super admin or by an admin
-- within their own kindergartens.
-- ---------------------------------------------------------------------------

create policy user_kindergartens_select on public.user_kindergartens
  for select
  using (
    public.is_super_admin()
    or user_id = auth.uid()
    or kindergarten_id in (select public.user_kindergarten_ids())
  );

create policy user_kindergartens_insert on public.user_kindergartens
  for insert
  with check (
    public.is_super_admin()
    or (
      public.current_user_role() = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

create policy user_kindergartens_delete on public.user_kindergartens
  for delete
  using (
    public.is_super_admin()
    or (
      public.current_user_role() = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- groups — admin manages all groups in their kindergartens; educator
-- additionally sees only the groups they are assigned to.
-- ---------------------------------------------------------------------------

create policy groups_select on public.groups
  for select
  using (
    deleted_at is null
    and (
      public.is_super_admin()
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          public.current_user_role() = 'admin'
          or educator_id = auth.uid()
        )
      )
    )
  );

create policy groups_insert on public.groups
  for insert
  with check (
    public.is_super_admin()
    or (
      public.current_user_role() = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

create policy groups_update on public.groups
  for update
  using (
    public.is_super_admin()
    or (
      public.current_user_role() = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.current_user_role() = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- children — admin manages all children in their kindergartens; educator
-- additionally limited to children in groups they are assigned to.
-- ---------------------------------------------------------------------------

create policy children_select on public.children
  for select
  using (
    deleted_at is null
    and (
      public.is_super_admin()
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          public.current_user_role() = 'admin'
          or group_id in (select id from public.groups where educator_id = auth.uid())
        )
      )
    )
  );

create policy children_insert on public.children
  for insert
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

create policy children_update on public.children
  for update
  using (
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

-- ---------------------------------------------------------------------------
-- parents — same access rule as the child they belong to.
-- ---------------------------------------------------------------------------

create policy parents_select on public.parents
  for select
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
  );

create policy parents_insert on public.parents
  for insert
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

create policy parents_update on public.parents
  for update
  using (
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

-- ---------------------------------------------------------------------------
-- audit_logs — append-only: insert your own actions, read scoped by role.
-- No UPDATE/DELETE policy on purpose.
-- ---------------------------------------------------------------------------

create policy audit_logs_select on public.audit_logs
  for select
  using (
    public.is_super_admin()
    or (
      public.current_user_role() = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

create policy audit_logs_insert on public.audit_logs
  for insert
  with check (user_id = auth.uid());
