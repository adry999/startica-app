-- supabase/tests/rls_isolation.test.sql
--
-- Verifies the core multi-tenancy invariant: an admin assigned to KG-A cannot
-- read users or kindergartens that belong only to KG-B.
--
-- Run with: supabase test db
--
-- Relies on seed users (populated by `supabase db reset`):
--   22222222-2222-2222-2222-222222222222  admin  (assigned to KG-A only)
--   aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa  Grădinița Zâna Florilor (KG-A)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = '22222222-2222-2222-2222-222222222222'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.kindergartens WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) THEN
    RAISE EXCEPTION 'Seed data missing — run "supabase db reset" before "supabase test db"';
  END IF;
END $$;

BEGIN;
SELECT plan(4);

-- ── Setup: KG-B and a user assigned only to KG-B ────────────────────────────
-- All data is rolled back at the end; doesn't pollute the dev DB.

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'authenticated', 'authenticated',
  'kgb-user@test.local',
  crypt('TestPass123!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);

INSERT INTO public.users (id, email, full_name, role, status, created_by)
VALUES (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'kgb-user@test.local',
  'KG-B Educator',
  'educator',
  'active',
  '11111111-1111-1111-1111-111111111111'
);

INSERT INTO public.kindergartens (id, name, address, city, status, settings, created_by)
VALUES (
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'Grădinița B',
  'Str. Test nr. 1',
  'București',
  'active',
  '{"timezone":"Europe/Bucharest","default_locale":"ro","working_hours":{"start":"08:00","end":"17:00"}}'::jsonb,
  '11111111-1111-1111-1111-111111111111'
);

INSERT INTO public.user_kindergartens (user_id, kindergarten_id, created_by)
VALUES (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  '11111111-1111-1111-1111-111111111111'
);

-- ── Simulate admin session (KG-A only) ───────────────────────────────────────
-- SET LOCAL ROLE switches to the `authenticated` role so Postgres enforces RLS.
-- Without this the session runs as the `postgres` superuser which bypasses RLS
-- and sees all rows regardless of policy.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

-- ── Test 1: admin cannot read a user from a different kindergarten ────────────
SELECT is(
  (SELECT count(*) FROM public.users WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  0::bigint,
  'admin cannot read users belonging only to a different kindergarten'
);

-- ── Test 2: admin cannot read a kindergarten they are not assigned to ─────────
SELECT is(
  (SELECT count(*) FROM public.kindergartens WHERE id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'),
  0::bigint,
  'admin cannot read a kindergarten they are not assigned to'
);

-- ── Test 3 (positive): admin CAN read their own kindergarten ──────────────────
SELECT is(
  (SELECT count(*) FROM public.kindergartens WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  1::bigint,
  'admin can read their own kindergarten'
);

-- ── Test 4 (positive): admin CAN read a user from their own kindergarten ──────
SELECT is(
  (SELECT count(*) FROM public.users WHERE id = '33333333-3333-3333-3333-333333333333'),
  1::bigint,
  'admin can read users from their own kindergarten'
);

-- Reset back to superuser before finish() so pgTAP cleanup has full privileges.
RESET ROLE;
RESET "request.jwt.claims";
SELECT finish();
ROLLBACK;
