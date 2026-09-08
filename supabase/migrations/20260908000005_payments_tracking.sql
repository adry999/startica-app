-- Payment tracking - record individual payments against invoices

create type payment_status as enum ('pending', 'confirmed', 'failed');

create table payments (
  id uuid primary key default gen_random_uuid(),
  kindergarten_id uuid not null references kindergartens(id),
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount numeric(12, 2) not null,
  paid_date date not null,
  method text not null, -- bank_transfer, cash, check, online, etc
  reference_number text,
  status payment_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  updated_by uuid not null references users(id),
  deleted_at timestamptz
);

-- RLS: users see payments for their kindergartens
alter table payments enable row level security;

create policy payments_select on payments for select
  using (kindergarten_id in (select kindergarten_id from user_kindergartens where user_id = auth.uid())
  or auth.jwt()->>'role' = 'super_admin');

create policy payments_insert on payments for insert
  with check (kindergarten_id in (select kindergarten_id from user_kindergartens where user_id = auth.uid())
  or auth.jwt()->>'role' = 'super_admin');

create policy payments_update on payments for update
  using (kindergarten_id in (select kindergarten_id from user_kindergartens where user_id = auth.uid())
  or auth.jwt()->>'role' = 'super_admin');

create policy payments_delete on payments for delete
  using (kindergarten_id in (select kindergarten_id from user_kindergartens where user_id = auth.uid())
  or auth.jwt()->>'role' = 'super_admin');

-- Triggers
create trigger update_payments_updated_at before update on payments
  for each row execute function fn_update_timestamp();

create trigger payments_audit_log after delete on payments
  for each row execute function fn_audit_log_soft_delete();

-- Indexes
create index idx_payments_kg_date on payments(kindergarten_id, paid_date) where deleted_at is null;
create index idx_payments_invoice on payments(invoice_id) where deleted_at is null;
create index idx_payments_status on payments(status) where deleted_at is null;

grant select, insert, update, delete on payments to service_role;
