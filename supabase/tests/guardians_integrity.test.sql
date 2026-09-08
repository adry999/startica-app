-- Tenant integrity and primary-guardian invariant.
-- Run with: supabase test db (after `supabase db reset`).

BEGIN;
SELECT plan(5);

INSERT INTO public.kindergartens (id, name, address, city, status, settings, created_by)
VALUES
  ('eeeeeeee-1000-4000-8000-000000000001', 'KG Integrity A', 'Test 1', 'Cluj', 'active', '{}'::jsonb, '11111111-1111-1111-1111-111111111111'),
  ('eeeeeeee-2000-4000-8000-000000000002', 'KG Integrity B', 'Test 2', 'Cluj', 'active', '{}'::jsonb, '11111111-1111-1111-1111-111111111111');

INSERT INTO public.groups (id, kindergarten_id, name, status, created_by)
VALUES ('eeeeeeee-3000-4000-8000-000000000003', 'eeeeeeee-2000-4000-8000-000000000002', 'Group B', 'active', '11111111-1111-1111-1111-111111111111');

INSERT INTO public.children (id, kindergarten_id, first_name, last_name, birth_date, status, created_by)
VALUES ('eeeeeeee-4000-4000-8000-000000000004', 'eeeeeeee-1000-4000-8000-000000000001', 'Child', 'A', date '2021-01-01', 'enrolled', '11111111-1111-1111-1111-111111111111');

SELECT throws_ok(
  $$INSERT INTO public.children (kindergarten_id, group_id, first_name, last_name, birth_date, status, created_by)
    VALUES ('eeeeeeee-1000-4000-8000-000000000001', 'eeeeeeee-3000-4000-8000-000000000003', 'Wrong', 'Group', date '2021-01-01', 'enrolled', '11111111-1111-1111-1111-111111111111')$$,
  '23514',
  'cross-tenant group assignment is rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.parents (kindergarten_id, child_id, full_name, created_by)
    VALUES ('eeeeeeee-2000-4000-8000-000000000002', 'eeeeeeee-4000-4000-8000-000000000004', 'Wrong Parent', '11111111-1111-1111-1111-111111111111')$$,
  '23514',
  'cross-tenant parent assignment is rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.guardians (kindergarten_id, child_id, first_name, last_name, created_by)
    VALUES ('eeeeeeee-2000-4000-8000-000000000002', 'eeeeeeee-4000-4000-8000-000000000004', 'Wrong', 'Guardian', '11111111-1111-1111-1111-111111111111')$$,
  '23514',
  'cross-tenant guardian assignment is rejected'
);

INSERT INTO public.guardians (id, kindergarten_id, child_id, first_name, last_name, is_primary, created_by)
VALUES ('eeeeeeee-5000-4000-8000-000000000005', 'eeeeeeee-1000-4000-8000-000000000001', 'eeeeeeee-4000-4000-8000-000000000004', 'First', 'Guardian', true, '11111111-1111-1111-1111-111111111111');

SELECT lives_ok(
  $$INSERT INTO public.guardians (kindergarten_id, child_id, first_name, last_name, is_primary, created_by)
    VALUES ('eeeeeeee-1000-4000-8000-000000000001', 'eeeeeeee-4000-4000-8000-000000000004', 'Second', 'Guardian', true, '11111111-1111-1111-1111-111111111111')$$,
  'new primary guardian replaces the previous primary'
);

SELECT is(
  (SELECT count(*) FROM public.guardians WHERE child_id = 'eeeeeeee-4000-4000-8000-000000000004' AND is_primary AND deleted_at IS NULL),
  1::bigint,
  'exactly one live primary guardian remains'
);

SELECT * FROM finish();
ROLLBACK;
