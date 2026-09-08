-- Invoice tracking for billing module
create type invoice_status as enum ('draft', 'issued', 'paid', 'overdue', 'cancelled');

create table invoices (
  id uuid primary key default gen_random_uuid(),
  kindergarten_id uuid not null references kindergartens(id),
  child_id uuid not null references children(id),
  amount numeric(12, 2) not null,
  due_date date not null,
  paid_at timestamptz,
  status invoice_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_by uuid references users(id),
  deleted_at timestamptz
);

-- RLS: users see invoices for their kindergartens
alter table invoices enable row level security;
create policy "invoices_select" on invoices for select
  using (kindergarten_id in (select kindergarten_id from user_kindergartens where user_id = auth.uid())
  or auth.jwt()->>'role' = 'super_admin');

create policy "invoices_insert" on invoices for insert
  with check (kindergarten_id in (select kindergarten_id from user_kindergartens where user_id = auth.uid())
  or auth.jwt()->>'role' = 'super_admin');

create policy "invoices_update" on invoices for update
  using (kindergarten_id in (select kindergarten_id from user_kindergartens where user_id = auth.uid())
  or auth.jwt()->>'role' = 'super_admin');

create policy "invoices_delete" on invoices for delete
  using (kindergarten_id in (select kindergarten_id from user_kindergartens where user_id = auth.uid())
  or auth.jwt()->>'role' = 'super_admin');

-- Auto-update trigger
create trigger update_invoices_updated_at before update on invoices
  for each row execute function fn_update_timestamp();

-- Indexes
create index idx_invoices_kg_date on invoices(kindergarten_id, due_date) where deleted_at is null;
create index idx_invoices_child_status on invoices(child_id, status) where deleted_at is null;
create index idx_invoices_status on invoices(status) where deleted_at is null;
