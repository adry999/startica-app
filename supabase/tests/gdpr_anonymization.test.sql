-- GDPR anonymization removes PII while retaining an auditable record.
-- Run with: supabase test db (after `supabase db reset`).

BEGIN;
SELECT plan(4);

INSERT INTO public.children (
  id, kindergarten_id, first_name, last_name, birth_date, national_id, id_type,
  allergies, medical_notes, status, created_by
) VALUES (
  'dddddddd-3000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'GDPR', 'Child', date '2021-01-01', '5210101123456', 'CNP',
  'Peanuts', 'Sensitive medical data', 'enrolled',
  '11111111-1111-1111-1111-111111111111'
);

INSERT INTO public.guardians (child_id, kindergarten_id, first_name, last_name, email, phone, created_by)
VALUES (
  'dddddddd-3000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'GDPR', 'Guardian', 'gdpr.guardian@example.test', '+40123456789',
  '11111111-1111-1111-1111-111111111111'
);

INSERT INTO public.parents (child_id, kindergarten_id, full_name, email, phone, created_by)
VALUES (
  'dddddddd-3000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'GDPR Parent', 'gdpr.parent@example.test', '+40987654321',
  '11111111-1111-1111-1111-111111111111'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

SELECT lives_ok(
  $$SELECT public.anonymize_child('dddddddd-3000-4000-8000-000000000001')$$,
  'assigned admin can anonymize a child in their kindergarten'
);

RESET ROLE;
RESET "request.jwt.claims";

SELECT ok(
  (SELECT deleted_at is not null
    and first_name = 'Anonymized'
    and national_id is null
    and allergies is null
    and medical_notes is null
   FROM public.children WHERE id = 'dddddddd-3000-4000-8000-000000000001'),
  'child PII is anonymized and record is hidden'
);

SELECT ok(
  (SELECT deleted_at is not null and email is null and phone is null
   FROM public.guardians WHERE child_id = 'dddddddd-3000-4000-8000-000000000001'),
  'guardian contact PII is anonymized'
);

SELECT ok(
  (SELECT deleted_at is not null and email is null and phone is null
   FROM public.parents WHERE child_id = 'dddddddd-3000-4000-8000-000000000001'),
  'legacy parent contact PII is anonymized'
);

SELECT * FROM finish();
ROLLBACK;
