-- Expense tracking - operational costs and budget management

create type expense_category as enum ('salaries', 'rent', 'utilities', 'supplies', 'maintenance', 'food', 'transportation', 'other');
create type expense_status as enum ('draft', 'approved', 'rejected');

create table expenses (
  id uuid primary key default gen_random_uuid(),
  kindergarten_id uuid not null references kindergartens(id),
  category expense_category not null,
  amount numeric(12, 2) not null,
  expense_date date not null,
  description text,
  status expense_status not null default 'draft',
  approved_by uuid references users(id),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  updated_by uuid not null references users(id),
  deleted_at timestamptz
);

-- RLS: users see expenses for their kindergartens
alter table expenses enable row level security;

create policy expenses_select on expenses for select
  using (kindergarten_id in (select kindergarten_id from user_kindergartens where user_id = auth.uid())
  or auth.jwt()->>'role' = 'super_admin');

create policy expenses_insert on expenses for insert
  with check (kindergarten_id in (select kindergarten_id from user_kindergartens where user_id = auth.uid())
  or auth.jwt()->>'role' = 'super_admin');

create policy expenses_update on expenses for update
  using (kindergarten_id in (select kindergarten_id from user_kindergartens where user_id = auth.uid())
  or auth.jwt()->>'role' = 'super_admin');

create policy expenses_delete on expenses for delete
  using (kindergarten_id in (select kindergarten_id from user_kindergartens where user_id = auth.uid())
  or auth.jwt()->>'role' = 'super_admin');

-- Triggers
create trigger update_expenses_updated_at before update on expenses
  for each row execute function fn_update_timestamp();

create trigger expenses_audit_log after delete on expenses
  for each row execute function fn_audit_log_soft_delete();

-- Indexes
create index idx_expenses_kg_date on expenses(kindergarten_id, expense_date) where deleted_at is null;
create index idx_expenses_category on expenses(category) where deleted_at is null;
create index idx_expenses_status on expenses(status) where deleted_at is null;

grant select, insert, update, delete on expenses to service_role;
