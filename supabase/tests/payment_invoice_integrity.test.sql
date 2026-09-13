-- Regression coverage for 20260913000001_payment_invoice_integrity.sql.
-- Run with: npm run test:db -- payment_invoice_integrity

begin;
select plan(17);

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
  ('e2000000-0000-4000-8000-000000000001'::uuid, 'payable-super@test.local'),
  ('e2000000-0000-4000-8000-000000000002'::uuid, 'payable-admin-a@test.local'),
  ('e2000000-0000-4000-8000-000000000003'::uuid, 'payable-educator@test.local'),
  ('e2000000-0000-4000-8000-000000000004'::uuid, 'payable-admin-b@test.local')
) as fixture(id, email);

insert into public.users (id, email, full_name, role, status)
values
  ('e2000000-0000-4000-8000-000000000001', 'payable-super@test.local', 'Super', 'super_admin', 'active'),
  ('e2000000-0000-4000-8000-000000000002', 'payable-admin-a@test.local', 'Admin A', 'admin', 'active'),
  ('e2000000-0000-4000-8000-000000000003', 'payable-educator@test.local', 'Educator', 'educator', 'active'),
  ('e2000000-0000-4000-8000-000000000004', 'payable-admin-b@test.local', 'Admin B', 'admin', 'active');

insert into public.kindergartens (id, name, status, settings)
values
  ('f2000000-0000-4000-8000-000000000001', 'Payable A', 'active', '{}'::jsonb),
  ('f2000000-0000-4000-8000-000000000002', 'Payable B', 'active', '{}'::jsonb);

insert into public.user_kindergartens (user_id, kindergarten_id)
values
  ('e2000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000002');

insert into public.children (id, kindergarten_id, first_name, last_name, birth_date, status)
values ('c2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'Payable', 'Child', '2020-01-01', 'enrolled');

insert into public.invoices (id, kindergarten_id, child_id, amount, due_date, status, deleted_at)
values
  ('d2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 100, current_date + 30, 'issued', null),
  ('d2000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 100, current_date - 1, 'overdue', null),
  ('d2000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 100, current_date + 30, 'draft', null),
  ('d2000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 100, current_date + 30, 'paid', null),
  ('d2000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 100, current_date + 30, 'cancelled', null),
  ('d2000000-0000-4000-8000-000000000006', 'f2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 100, current_date + 30, 'issued', now());

select lives_ok(
  $$insert into public.payments (id, kindergarten_id, invoice_id, amount, paid_date, method, created_by, updated_by) values ('a2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 10, current_date, 'cash', 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001')$$,
  'an issued invoice accepts a payment'
);
select lives_ok(
  $$insert into public.payments (id, kindergarten_id, invoice_id, amount, paid_date, method, created_by, updated_by) values ('a2000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 20, current_date, 'cash', 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001')$$,
  'an overdue invoice accepts a payment'
);
select throws_ok(
  $$insert into public.payments (kindergarten_id, invoice_id, amount, paid_date, method, created_by, updated_by) values ('f2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000003', 10, current_date, 'cash', 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'a draft invoice rejects a payment'
);
select lives_ok(
  $$insert into public.payments (kindergarten_id, invoice_id, amount, paid_date, method, created_by, updated_by) values ('f2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000004', 10, current_date, 'cash', 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001')$$,
  'a paid invoice still accepts a further payment'
);
select throws_ok(
  $$insert into public.payments (kindergarten_id, invoice_id, amount, paid_date, method, created_by, updated_by) values ('f2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000005', 10, current_date, 'cash', 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'a cancelled invoice rejects a payment'
);
select throws_ok(
  $$insert into public.payments (kindergarten_id, invoice_id, amount, paid_date, method, created_by, updated_by) values ('f2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000006', 10, current_date, 'cash', 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'a soft-deleted invoice rejects a payment'
);

update public.invoices set status = 'cancelled' where id = 'd2000000-0000-4000-8000-000000000001';
select lives_ok(
  $$update public.payments set status = 'confirmed' where id = 'a2000000-0000-4000-8000-000000000001'$$,
  'a pending payment can still be confirmed after its invoice is cancelled'
);
select throws_ok(
  $$update public.payments set invoice_id = 'd2000000-0000-4000-8000-000000000005' where id = 'a2000000-0000-4000-8000-000000000002'$$,
  '23514', null, 'a payment cannot be moved onto a cancelled invoice'
);

-- More confirmed rows than PostgREST returns in one response.
insert into public.payments (kindergarten_id, invoice_id, amount, paid_date, method, status, created_by, updated_by)
select 'f2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 2, current_date, 'cash', 'confirmed', 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001'
from generate_series(1, 1001);

insert into public.payments (kindergarten_id, invoice_id, amount, paid_date, method, status, deleted_at, created_by, updated_by)
values
  ('f2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 4, current_date, 'cash', 'failed', null, 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 5, current_date, 'cash', 'confirmed', now(), 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001');

set local role authenticated;

set local "request.jwt.claims" = '{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$insert into public.payments (kindergarten_id, invoice_id, amount, paid_date, method, created_by, updated_by) values ('f2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 7, current_date, 'cash', auth.uid(), auth.uid())$$,
  'admin can record a payment on an overdue invoice in their kindergarten'
);
select throws_ok(
  $$insert into public.payments (kindergarten_id, invoice_id, amount, paid_date, method, created_by, updated_by) values ('f2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000003', 7, current_date, 'cash', auth.uid(), auth.uid())$$,
  '23514', null, 'admin cannot record a payment on a draft invoice'
);
select is((select confirmed_total from public.payment_summary('f2000000-0000-4000-8000-000000000001')), 2012::numeric, 'summary totals every live confirmed payment beyond the response cap');
select is((select pending_count from public.payment_summary('f2000000-0000-4000-8000-000000000001')), 3::bigint, 'summary counts pending payments');
select is((select confirmed_count from public.payment_summary('f2000000-0000-4000-8000-000000000001')), 1002::bigint, 'summary counts confirmed payments and skips soft-deleted ones');
select is((select failed_count from public.payment_summary('f2000000-0000-4000-8000-000000000001')), 1::bigint, 'summary counts failed payments');

set local "request.jwt.claims" = '{"sub":"e2000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select confirmed_total from public.payment_summary('f2000000-0000-4000-8000-000000000001')), 0::numeric, 'educator cannot aggregate payments');

set local "request.jwt.claims" = '{"sub":"e2000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select confirmed_total from public.payment_summary('f2000000-0000-4000-8000-000000000001')), 0::numeric, 'admin cannot aggregate payments of another kindergarten');

set local "request.jwt.claims" = '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select confirmed_total from public.payment_summary('f2000000-0000-4000-8000-000000000001')), 2012::numeric, 'super admin can aggregate without kindergarten membership');

reset role;
reset "request.jwt.claims";
select finish();
rollback;
