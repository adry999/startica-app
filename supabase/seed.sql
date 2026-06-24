-- Startica — seed data (runs on `supabase db reset`)
--
-- LOCAL DEV ONLY. Inserts directly into auth.users/auth.identities to
-- bootstrap real Supabase Auth accounts against the local stack — this is
-- the standard technique for seeding auth users without the Admin API.
-- Never run this against a hosted/production project. Rotate or remove
-- these credentials before any real deployment.
--
-- Demo password for every seeded account: Startica123!

-- ============================================================================
-- 1) Bootstrap: first Super Admin (no one exists yet to invite them)
-- ============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'admin@startica.dev',
  crypt('Startica123!', gen_salt('bf')),
  now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(), now(),
  '', '', '', ''
);

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"admin@startica.dev"}'::jsonb,
  'email',
  '11111111-1111-1111-1111-111111111111',
  now(), now(), now()
);

insert into public.users (id, email, full_name, role, status, created_at, updated_at)
values (
  '11111111-1111-1111-1111-111111111111',
  'admin@startica.dev',
  'Super Admin',
  'super_admin',
  'active',
  now(), now()
);

-- ============================================================================
-- 2) Demo kindergarten + a demo Admin and a demo Educator account
-- ============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated',
    'admin.demo@startica.dev',
    crypt('Startica123!', gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-3333-3333-333333333333',
    'authenticated', 'authenticated',
    'educator.demo@startica.dev',
    crypt('Startica123!', gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now(),
    '', '', '', ''
  );

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values
  (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
    '{"sub":"22222222-2222-2222-2222-222222222222","email":"admin.demo@startica.dev"}'::jsonb,
    'email', '22222222-2222-2222-2222-222222222222', now(), now(), now()
  ),
  (
    gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
    '{"sub":"33333333-3333-3333-3333-333333333333","email":"educator.demo@startica.dev"}'::jsonb,
    'email', '33333333-3333-3333-3333-333333333333', now(), now(), now()
  );

insert into public.users (id, email, full_name, role, status, created_at, updated_at, created_by)
values
  (
    '22222222-2222-2222-2222-222222222222', 'admin.demo@startica.dev', 'Maria Ionescu', 'admin',
    'active', now(), now(), '11111111-1111-1111-1111-111111111111'
  ),
  (
    '33333333-3333-3333-3333-333333333333', 'educator.demo@startica.dev', 'Elena Popescu', 'educator',
    'active', now(), now(), '11111111-1111-1111-1111-111111111111'
  );

insert into public.kindergartens (id, name, address, city, phone, status, settings, created_at, updated_at, created_by)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Grădinița Zâna Florilor',
  'Str. Primăverii nr. 12',
  'Cluj-Napoca',
  '+40 264 123 456',
  'active',
  '{"timezone": "Europe/Bucharest", "default_locale": "ro", "working_hours": {"start": "07:30", "end": "18:00"}}'::jsonb,
  now(), now(),
  '11111111-1111-1111-1111-111111111111'
);

insert into public.user_kindergartens (user_id, kindergarten_id, created_by)
values
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111');

-- ============================================================================
-- 3) Demo groups
-- ============================================================================

insert into public.groups (id, kindergarten_id, name, age_range, educator_id, status, created_at, updated_at, created_by)
values
  (
    'bbbbbbbb-0001-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Fluturași', '3-4 ani', '33333333-3333-3333-3333-333333333333', 'active',
    now(), now(), '22222222-2222-2222-2222-222222222222'
  ),
  (
    'bbbbbbbb-0002-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Albinuțe', '4-5 ani', null, 'active',
    now(), now(), '22222222-2222-2222-2222-222222222222'
  );

-- ============================================================================
-- 4) Demo children — covers: allergies/medical highlight, CNP, IDNP
--    (Moldova), and a child with no national_id at all (optional field).
-- ============================================================================

insert into public.children (
  id, kindergarten_id, group_id, first_name, last_name, birth_date,
  blood_group, allergies, medical_notes, national_id, id_type, status,
  created_at, updated_at, created_by
) values
  (
    'cccccccc-0001-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-0001-0000-0000-000000000000', 'Andrei', 'Vasilescu', date '2021-05-14',
    'A+', 'Alergie la arahide', 'Poartă EpiPen în ghiozdan, anunțat și familiei.',
    '5210514123456', 'CNP', 'enrolled',
    now(), now(), '22222222-2222-2222-2222-222222222222'
  ),
  (
    'cccccccc-0002-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-0001-0000-0000-000000000000', 'Ioana', 'Marin', date '2021-09-02',
    'O+', null, null,
    '6210902123457', 'CNP', 'enrolled',
    now(), now(), '22222222-2222-2222-2222-222222222222'
  ),
  (
    'cccccccc-0003-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-0002-0000-0000-000000000000', 'Maxim', 'Rusu', date '2020-11-23',
    null, null, null,
    '2001123456789', 'IDNP', 'enrolled',
    now(), now(), '22222222-2222-2222-2222-222222222222'
  ),
  (
    'cccccccc-0004-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-0002-0000-0000-000000000000', 'Sofia', 'Dumitrescu', date '2020-07-30',
    'B+', 'Intoleranță la lactoză', null,
    null, null, 'enrolled',
    now(), now(), '22222222-2222-2222-2222-222222222222'
  );

-- ============================================================================
-- 5) Demo parents / contacts
-- ============================================================================

insert into public.parents (
  id, kindergarten_id, child_id, full_name, phone, email, relationship,
  created_at, updated_at, created_by
) values
  (
    gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0001-0000-0000-000000000000',
    'Cristina Vasilescu', '+40 722 111 222', 'cristina.vasilescu@example.com', 'mamă',
    now(), now(), '22222222-2222-2222-2222-222222222222'
  ),
  (
    gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0001-0000-0000-000000000000',
    'Radu Vasilescu', '+40 722 111 223', 'radu.vasilescu@example.com', 'tată',
    now(), now(), '22222222-2222-2222-2222-222222222222'
  ),
  (
    gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0002-0000-0000-000000000000',
    'Mihaela Marin', '+40 722 333 444', 'mihaela.marin@example.com', 'mamă',
    now(), now(), '22222222-2222-2222-2222-222222222222'
  ),
  (
    gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0003-0000-0000-000000000000',
    'Olga Rusu', '+373 691 23 456', 'olga.rusu@example.com', 'mamă',
    now(), now(), '22222222-2222-2222-2222-222222222222'
  ),
  (
    gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0004-0000-0000-000000000000',
    'Bogdan Dumitrescu', '+40 722 555 666', 'bogdan.dumitrescu@example.com', 'tată',
    now(), now(), '22222222-2222-2222-2222-222222222222'
  );
