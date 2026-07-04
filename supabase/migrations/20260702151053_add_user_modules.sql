-- user_modules — per-educator, per-kindergarten opt-in module grants.
-- No row = no access. Admin/Super Admin bypass this table (role-based).
create table public.user_modules (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.users(id) on delete cascade,
  kindergarten_id uuid        not null references public.kindergartens(id),
  module_key      text        not null check (module_key in ('pool','payroll_own','payroll_all')),
  granted_by      uuid        not null references public.users(id),
  granted_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        references public.users(id),
  updated_by      uuid        references public.users(id),
  deleted_at      timestamptz
);

-- At most one live grant of a given key per (user, kindergarten).
create unique index user_modules_unique_live
  on public.user_modules (user_id, kindergarten_id, module_key)
  where deleted_at is null;

create index user_modules_user_kg on public.user_modules (user_id, kindergarten_id);
create index user_modules_kg      on public.user_modules (kindergarten_id);

alter table public.user_modules enable row level security;

create trigger trg_user_modules_set_updated_at
  before update on public.user_modules
  for each row execute function public.set_updated_at();

create trigger trg_user_modules_audit_columns
  before insert or update on public.user_modules
  for each row execute function public.set_audit_columns();

create trigger audit_user_modules
  after insert or update or delete on public.user_modules
  for each row execute function public.write_audit_log();

-- READ: super admin; the grantee (own rows, so their sidebar resolves);
-- admins of the kindergarten (to manage). Live rows only.
create policy "user_modules: read"
  on public.user_modules for select to authenticated
  using (
    (
      (select public.is_super_admin())
      or user_id = auth.uid()
      or (
        (select public.current_user_role()) = 'admin'
        and kindergarten_id in (select public.user_kindergarten_ids())
      )
    )
    and deleted_at is null
  );

-- INSERT: super admin, or an admin of that kindergarten. Never the educator
-- themselves — prevents self-escalation.
create policy "user_modules: insert"
  on public.user_modules for insert to authenticated
  with check (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

-- UPDATE: same authority (covers soft-delete/revoke, which is an update of deleted_at).
create policy "user_modules: update"
  on public.user_modules for update to authenticated
  using (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

-- No DELETE grant: revoke is a soft delete (update of deleted_at).
grant select, insert, update on public.user_modules to authenticated;
