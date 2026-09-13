-- Regression coverage for 20260909000002_attendance_financial_integrity.sql.
-- Run with: supabase test db

begin;
select plan(16);

-- Fixtures are local to this transaction and do not depend on seed data.
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
  ('10000000-0000-4000-8000-000000000001'::uuid, 'integrity-super@test.local'),
  ('10000000-0000-4000-8000-000000000002'::uuid, 'integrity-admin@test.local'),
  ('10000000-0000-4000-8000-000000000003'::uuid, 'integrity-educator@test.local')
) as fixture(id, email);

insert into public.users (id, email, full_name, role, status)
values
  ('10000000-0000-4000-8000-000000000001', 'integrity-super@test.local', 'Super', 'super_admin', 'active'),
  ('10000000-0000-4000-8000-000000000002', 'integrity-admin@test.local', 'Admin', 'admin', 'active'),
  ('10000000-0000-4000-8000-000000000003', 'integrity-educator@test.local', 'Educator', 'educator', 'active');

insert into public.kindergartens (id, name, status, settings)
values
  ('20000000-0000-4000-8000-000000000001', 'Integrity A', 'active', '{}'::jsonb),
  ('20000000-0000-4000-8000-000000000002', 'Integrity B', 'active', '{}'::jsonb);

insert into public.user_kindergartens (user_id, kindergarten_id)
values
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001');

insert into public.groups (id, kindergarten_id, name, educator_id, status)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Educator group', '10000000-0000-4000-8000-000000000003', 'active'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Other group', null, 'active'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Archived group', '10000000-0000-4000-8000-000000000003', 'archived'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', 'Tenant B group', null, 'active');

insert into public.children (id, kindergarten_id, group_id, first_name, last_name, birth_date, status)
values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Own', 'Child', '2020-01-01', 'enrolled'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Other', 'Child', '2020-01-01', 'enrolled'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'Archived', 'Child', '2020-01-01', 'enrolled'),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', 'Tenant', 'B', '2020-01-01', 'enrolled');

insert into public.invoices (id, kindergarten_id, child_id, amount, due_date, status)
values ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 100, '2026-09-01', 'issued');

insert into public.payments (kindergarten_id, invoice_id, amount, paid_date, method, status, created_by, updated_by)
values ('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 20, '2026-09-01', 'cash', 'confirmed', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');

insert into public.attendance (id, kindergarten_id, group_id, child_id, date, status, marked_by, created_by, updated_by)
values
  ('70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '2026-09-01', 'present', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '2026-09-01', 'present', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', '2026-09-01', 'present', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', '2026-09-01', 'present', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');

select throws_ok(
  $$insert into public.invoices (kindergarten_id, child_id, amount, due_date) values ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', 10, '2026-09-01')$$,
  '23503', null, 'invoice child must belong to the invoice kindergarten'
);
select throws_ok(
  $$insert into public.payments (kindergarten_id, invoice_id, amount, paid_date, method, created_by, updated_by) values ('20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 10, '2026-09-01', 'cash', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$$,
  '23503', null, 'payment invoice must belong to the payment kindergarten'
);
select throws_ok(
  $$insert into public.attendance (kindergarten_id, group_id, child_id, date, status, marked_by, created_by, updated_by) values ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', '2026-09-02', 'present', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$$,
  '23503', null, 'attendance group must belong to the attendance kindergarten'
);
select throws_ok(
  $$insert into public.attendance (kindergarten_id, group_id, child_id, date, status, marked_by, created_by, updated_by) values ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', '2026-09-02', 'present', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$$,
  '23503', null, 'attendance child must belong to the attendance kindergarten'
);
select throws_ok(
  $$update public.invoices set kindergarten_id = '20000000-0000-4000-8000-000000000002', child_id = '40000000-0000-4000-8000-000000000004' where id = '50000000-0000-4000-8000-000000000001'$$,
  '23503', null, 'invoice cannot move to another kindergarten while payments reference it'
);

set local role authenticated;

set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*) from public.attendance where kindergarten_id = '20000000-0000-4000-8000-000000000001'), 3::bigint, 'admin can read attendance in their kindergarten');
select is((select count(*) from public.attendance where kindergarten_id = '20000000-0000-4000-8000-000000000002'), 0::bigint, 'admin cannot read attendance in another kindergarten');
select lives_ok(
  $$insert into public.attendance (kindergarten_id, group_id, child_id, date, status, marked_by, created_by, updated_by) values ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '2026-09-02', 'present', '10000000-0000-4000-8000-000000000002', auth.uid(), auth.uid())$$,
  'admin can create attendance in their kindergarten'
);

set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*) from public.attendance where kindergarten_id = '20000000-0000-4000-8000-000000000001'), 1::bigint, 'educator sees only their live group');
select throws_ok(
  $$insert into public.attendance (kindergarten_id, group_id, child_id, date, status, marked_by, created_by, updated_by) values ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '2026-09-03', 'present', '10000000-0000-4000-8000-000000000003', auth.uid(), auth.uid())$$,
  '42501', null, 'educator cannot forge their group for another group child'
);
select is((select count(*) from public.attendance where id = '70000000-0000-4000-8000-000000000003'), 0::bigint, 'educator cannot read attendance from an archived group');
select lives_ok(
  $$insert into public.attendance (kindergarten_id, group_id, child_id, date, status, marked_by, created_by, updated_by) values ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '2026-09-01', 'absent', '10000000-0000-4000-8000-000000000003', auth.uid(), auth.uid()) on conflict (kindergarten_id, child_id, date) do update set status = excluded.status$$,
  'educator can upsert attendance in their own live group'
);
select lives_ok(
  $$update public.attendance set notes = 'updated by educator' where id = '70000000-0000-4000-8000-000000000001'$$,
  'educator can update attendance in their own live group'
);

reset role;
reset "request.jwt.claims";
update public.users set status = 'inactive' where id = '10000000-0000-4000-8000-000000000003';
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*) from public.attendance), 0::bigint, 'inactive educator loses attendance access immediately');

set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from public.attendance), 5::bigint, 'super admin can read attendance without a kindergarten membership');
select lives_ok(
  $$insert into public.attendance (kindergarten_id, group_id, child_id, date, status, marked_by, created_by, updated_by) values ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', '2026-09-02', 'present', '10000000-0000-4000-8000-000000000001', auth.uid(), auth.uid())$$,
  'super admin can create attendance without a kindergarten membership'
);

reset role;
reset "request.jwt.claims";
select finish();
rollback;
