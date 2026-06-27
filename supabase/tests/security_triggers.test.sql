-- supabase/tests/security_triggers.test.sql
-- Tests for:
--   1. prevent_self_privilege_escalation trigger (C1 + S3 fixes)
--   2. write_audit_log trigger (audit enforcement)
--
-- Run with: supabase test db
--
-- Relies on seed users (populated by `supabase db reset`):
--   11111111-1111-1111-1111-111111111111  super_admin  admin@startica.dev
--   22222222-2222-2222-2222-222222222222  admin        admin.demo@startica.dev
--
-- NOTE: the brief specified inserting fresh test users in the Setup block, but
-- public.users.id is a FK to auth.users.id, making that approach fragile.
-- Using existing seed users is simpler and avoids the FK bootstrapping entirely.
-- Both approaches test the same trigger behaviour; this is the only deviation.

-- Guard: fail fast with a clear message if seed users are missing.
-- Run 'supabase db reset' before 'supabase test db' if this fires.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = '22222222-2222-2222-2222-222222222222'
  ) THEN
    RAISE EXCEPTION 'Seed users missing — run "supabase db reset" before "supabase test db"';
  END IF;
END $$;

BEGIN;
SELECT plan(9);

-- ── Test 1: service_role can change role (trigger bypass) ────────────────────
-- auth.uid() IS NULL for service_role → trigger allows the update.
SELECT lives_ok(
  $$UPDATE public.users SET role = 'educator' WHERE id = '22222222-2222-2222-2222-222222222222'$$,
  'service_role can change any field (trigger bypass)'
);

-- Reset role so later tests start from a known state.
UPDATE public.users SET role = 'admin' WHERE id = '22222222-2222-2222-2222-222222222222';

-- ── Simulate authenticated session (admin user) ──────────────────────────────
-- SET LOCAL scopes the setting to this transaction; auth.uid() reads it.
SET LOCAL "request.jwt.claims" = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

-- ── Test 2: authenticated user cannot change own role ────────────────────────
-- SQLSTATE 42501 = insufficient_privilege (pg_prove 3.36 requires the 5-char code)
SELECT throws_ok(
  $$UPDATE public.users SET role = 'super_admin' WHERE id = '22222222-2222-2222-2222-222222222222'$$,
  '42501',
  'cannot change own role',
  'authenticated user cannot self-escalate role'
);

-- ── Test 3: authenticated user cannot change own status ──────────────────────
SELECT throws_ok(
  $$UPDATE public.users SET status = 'inactive' WHERE id = '22222222-2222-2222-2222-222222222222'$$,
  '42501',
  'cannot change own status',
  'authenticated user cannot change own status'
);

-- ── Test 4: authenticated user cannot change own deleted_at ──────────────────
SELECT throws_ok(
  $$UPDATE public.users SET deleted_at = now() WHERE id = '22222222-2222-2222-2222-222222222222'$$,
  '42501',
  'cannot change own deleted_at',
  'authenticated user cannot self-delete'
);

-- ── Test 5: authenticated user cannot change own email (S3 fix) ──────────────
SELECT throws_ok(
  $$UPDATE public.users SET email = 'other@test.local' WHERE id = '22222222-2222-2222-2222-222222222222'$$,
  '42501',
  'cannot change own email',
  'authenticated user cannot change own email'
);

-- ── Test 6: authenticated user CAN change own full_name (allowed field) ──────
SELECT lives_ok(
  $$UPDATE public.users SET full_name = 'Admin Renamed' WHERE id = '22222222-2222-2222-2222-222222222222'$$,
  'authenticated user can update full_name on own row'
);

-- ── Test 9: admin cannot promote another user to super_admin ─────────────────
-- The admin (22222222) shares a kindergarten with the educator (33333333), so
-- the USING clause permits the row — only the proxy-escalation guard blocks it.
-- JWT context is still the admin user from the SET LOCAL above.
SET LOCAL "request.jwt.claims" = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
SELECT throws_ok(
  $$UPDATE public.users SET role = 'super_admin' WHERE id = '33333333-3333-3333-3333-333333333333'$$,
  '42501',
  'only super_admin may grant or revoke the super_admin role',
  'admin cannot promote another user to super_admin (proxy-escalation blocked)'
);

-- ── Switch to super_admin session for audit tests ────────────────────────────
-- write_audit_log fires only when auth.uid() IS NOT NULL, so we must keep an
-- authenticated context. Using the super_admin avoids any self-guard conflicts.
SET LOCAL "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

-- ── Test 7: audit_logs row is written on UPDATE ───────────────────────────────
-- Capture count before, mutate, then assert exactly one new row via is().
-- set_config(..., true) keeps the value transaction-local.
DO $$ BEGIN
  PERFORM set_config('app.audit_before_7', (SELECT count(*)::text FROM public.audit_logs WHERE entity = 'users'), true);
END $$;

UPDATE public.users SET full_name = 'Audit Trigger Test'
  WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT count(*) FROM public.audit_logs WHERE entity = 'users') - current_setting('app.audit_before_7')::bigint,
  1::bigint,
  'audit_logs row is written on UPDATE'
);

-- ── Test 8: audit_logs row is written on INSERT ───────────────────────────────
-- public.users.id is a FK → auth.users.id, so we must insert the auth row first.
-- Both inserts are rolled back with the outer ROLLBACK.
DO $$ BEGIN
  PERFORM set_config('app.audit_before_8', (SELECT count(*)::text FROM public.audit_logs WHERE entity = 'users'), true);
END $$;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-4000-8000-000000000099',
  'authenticated', 'authenticated',
  'audit@test.local',
  crypt('TestPass123!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(),
  '', '', '', ''
);

-- set_audit_columns trigger will stamp created_by / updated_by
INSERT INTO public.users (id, email, full_name, role, status)
VALUES (
  'aaaaaaaa-0000-4000-8000-000000000099',
  'audit@test.local',
  'Audit Insert',
  'educator',
  'active'
);

SELECT is(
  (SELECT count(*) FROM public.audit_logs WHERE entity = 'users') - current_setting('app.audit_before_8')::bigint,
  1::bigint,
  'audit_logs row is written on INSERT'
);

RESET "request.jwt.claims";
SELECT finish();
ROLLBACK;
