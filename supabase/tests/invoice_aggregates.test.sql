-- Regression coverage for 20260909000003_invoice_aggregates.sql.
-- The generated rows exceed PostgREST's default response cap, proving that the
-- database aggregates include every matching row before a response is paged.

begin;
select plan(9);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  crypt('TestPass123!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('a1000000-0000-4000-8000-000000000001'::uuid, 'aggregate-super@test.local'),
  ('a1000000-0000-4000-8000-000000000002'::uuid, 'aggregate-admin-a@test.local'),
  ('a1000000-0000-4000-8000-000000000003'::uuid, 'aggregate-educator@test.local'),
  ('a1000000-0000-4000-8000-000000000004'::uuid, 'aggregate-admin-b@test.local')
) as fixture(id, email);

insert into public.users (id, email, full_name, role, status)
values
  ('a1000000-0000-4000-8000-000000000001', 'aggregate-super@test.local', 'Super', 'super_admin', 'active'),
  ('a1000000-0000-4000-8000-000000000002', 'aggregate-admin-a@test.local', 'Admin A', 'admin', 'active'),
  ('a1000000-0000-4000-8000-000000000003', 'aggregate-educator@test.local', 'Educator', 'educator', 'active'),
  ('a1000000-0000-4000-8000-000000000004', 'aggregate-admin-b@test.local', 'Admin B', 'admin', 'active');

insert into public.kindergartens (id, name, status, settings)
values
  ('b1000000-0000-4000-8000-000000000001', 'Aggregate A', 'active', '{}'::jsonb),
  ('b1000000-0000-4000-8000-000000000002', 'Aggregate B', 'active', '{}'::jsonb);

insert into public.user_kindergartens (user_id, kindergarten_id)
values
  ('a1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000002');

insert into public.children (id, kindergarten_id, first_name, last_name, birth_date, status)
values
  ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Aggregate', 'A', '2020-01-01', 'enrolled'),
  ('c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'Aggregate', 'B', '2020-01-01', 'enrolled');

insert into public.invoices (kindergarten_id, child_id, amount, due_date, status)
select 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 10, current_date + 30, 'issued'
from generate_series(1, 1001);

insert into public.invoices (id, kindergarten_id, child_id, amount, due_date, status, deleted_at)
values
  ('d1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 20, current_date + 30, 'paid', null),
  ('d1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 30, current_date + 30, 'draft', null),
  ('d1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 40, current_date + 30, 'overdue', null),
  ('d1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 50, current_date - 1, 'issued', null),
  ('d1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 60, current_date + 30, 'issued', now());

insert into public.payments (kindergarten_id, invoice_id, amount, paid_date, method, status, created_by, updated_by)
select 'b1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 2, current_date, 'cash', 'confirmed', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001'
from generate_series(1, 1001);

insert into public.payments (kindergarten_id, invoice_id, amount, paid_date, method, status, deleted_at, created_by, updated_by)
values
  ('b1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 3, current_date, 'cash', 'pending', null, 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 5, current_date, 'cash', 'confirmed', now(), 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select total_issued from public.invoice_summary('b1000000-0000-4000-8000-000000000001')), 10060::numeric, 'summary includes all 1,001 issued invoices');
select is((select total_paid from public.invoice_summary('b1000000-0000-4000-8000-000000000001')), 20::numeric, 'summary includes paid invoices only');
select is((select total_overdue from public.invoice_summary('b1000000-0000-4000-8000-000000000001')), 90::numeric, 'summary includes explicit and date-derived overdue invoices');
select is((select pending_count from public.invoice_summary('b1000000-0000-4000-8000-000000000001')), 1004::bigint, 'summary excludes paid and soft-deleted invoices from pending count');
select is(public.invoice_total_paid('d1000000-0000-4000-8000-000000000001'), 2002::numeric, 'payment total includes all 1,001 confirmed payments only');

set local "request.jwt.claims" = '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select total_issued from public.invoice_summary('b1000000-0000-4000-8000-000000000001')), 0::numeric, 'educator cannot aggregate invoice totals');
select is(public.invoice_total_paid('d1000000-0000-4000-8000-000000000001'), 0::numeric, 'educator cannot aggregate payment totals');

set local "request.jwt.claims" = '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select total_issued from public.invoice_summary('b1000000-0000-4000-8000-000000000001')), 0::numeric, 'admin cannot aggregate another kindergarten');

set local "request.jwt.claims" = '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select total_issued from public.invoice_summary('b1000000-0000-4000-8000-000000000001')), 10060::numeric, 'super admin can aggregate without kindergarten membership');

reset role;
reset "request.jwt.claims";
select finish();
rollback;
