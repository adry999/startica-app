-- Demo data: educators, groups, and children for the linked project.
--
-- supabase/seed.sql only runs on a local `db reset`, so a hosted project
-- starts empty. This migration fills it with workable demo data.
--
-- Educators get an auth.users row with NO password and NO auth.identities
-- row, so they show up in Staff and can be assigned to a group but CANNOT
-- sign in. That is deliberate: seeding usable credentials into a hosted
-- database is exactly what supabase/seed.sql warns against. To give one of
-- them real access, use the existing staff invite flow, which sends a
-- set-password link.
--
-- Idempotent: re-running inserts nothing new.

do $$
declare
  kg_id    uuid;
  actor_id uuid;
begin
  -- Attach to whichever kindergarten this project already has.
  select id into kg_id
  from public.kindergartens
  where deleted_at is null
  order by created_at
  limit 1;

  if kg_id is null then
    raise notice 'demo seed skipped: no kindergarten exists';
    return;
  end if;

  select id into actor_id
  from public.users
  where role = 'super_admin' and deleted_at is null
  order by created_at
  limit 1;

  -- ── Educators ───────────────────────────────────────────────────────────
  insert into auth.users (
    instance_id, id, aud, role, email,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
    ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'elena.popa@startica.dev',      now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'raluca.ionescu@startica.dev',  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'mihaela.stan@startica.dev',    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'cristina.barbu@startica.dev',  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
  on conflict (id) do nothing;

  insert into public.users (id, email, full_name, role, status, created_at, updated_at, created_by, updated_by)
  values
    ('d1000000-0000-4000-8000-000000000001', 'elena.popa@startica.dev',     'Elena Popa',      'educator', 'active', now(), now(), actor_id, actor_id),
    ('d1000000-0000-4000-8000-000000000002', 'raluca.ionescu@startica.dev', 'Raluca Ionescu',  'educator', 'active', now(), now(), actor_id, actor_id),
    ('d1000000-0000-4000-8000-000000000003', 'mihaela.stan@startica.dev',   'Mihaela Stan',    'educator', 'active', now(), now(), actor_id, actor_id),
    ('d1000000-0000-4000-8000-000000000004', 'cristina.barbu@startica.dev', 'Cristina Barbu',  'educator', 'active', now(), now(), actor_id, actor_id)
  on conflict (id) do nothing;

  insert into public.user_kindergartens (user_id, kindergarten_id, created_by)
  select u.id, kg_id, actor_id
  from (values
    ('d1000000-0000-4000-8000-000000000001'::uuid),
    ('d1000000-0000-4000-8000-000000000002'::uuid),
    ('d1000000-0000-4000-8000-000000000003'::uuid),
    ('d1000000-0000-4000-8000-000000000004'::uuid)
  ) as u(id)
  on conflict (user_id, kindergarten_id) do nothing;

  -- ── Groups (one educator each) ──────────────────────────────────────────
  insert into public.groups (id, kindergarten_id, name, age_range, educator_id, status, created_at, updated_at, created_by, updated_by)
  values
    ('d2000000-0000-4000-8000-000000000001', kg_id, 'Fluturași',  '3-4 ani', 'd1000000-0000-4000-8000-000000000001', 'active', now(), now(), actor_id, actor_id),
    ('d2000000-0000-4000-8000-000000000002', kg_id, 'Albinuțe',   '4-5 ani', 'd1000000-0000-4000-8000-000000000002', 'active', now(), now(), actor_id, actor_id),
    ('d2000000-0000-4000-8000-000000000003', kg_id, 'Buburuze',   '2-3 ani', 'd1000000-0000-4000-8000-000000000003', 'active', now(), now(), actor_id, actor_id),
    ('d2000000-0000-4000-8000-000000000004', kg_id, 'Steluțe',    '5-6 ani', 'd1000000-0000-4000-8000-000000000004', 'active', now(), now(), actor_id, actor_id)
  on conflict (id) do nothing;

  -- ── Children ────────────────────────────────────────────────────────────
  -- Mix of blood groups, allergies, medical notes, CNP / IDNP / no national
  -- id, and one withdrawn child, so list filters and badges have real data.
  insert into public.children (
    id, kindergarten_id, group_id, first_name, last_name, birth_date,
    blood_group, allergies, medical_notes, national_id, id_type, status,
    created_at, updated_at, created_by, updated_by
  ) values
    ('d3000000-0000-4000-8000-000000000001', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Andrei',   'Vasilescu',   date '2022-05-14', 'A+',  'Alergie la arahide',      'Poartă EpiPen în ghiozdan.', '5220514123401', 'CNP',  'enrolled',  now(), now(), actor_id, actor_id),
    ('d3000000-0000-4000-8000-000000000002', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Ioana',    'Marin',       date '2022-09-02', 'O+',  null,                      null,                          '6220902123402', 'CNP',  'enrolled',  now(), now(), actor_id, actor_id),
    ('d3000000-0000-4000-8000-000000000003', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Luca',     'Georgescu',   date '2022-02-18', 'B+',  null,                      'Astm ușor, spray la nevoie.', '5220218123403', 'CNP',  'enrolled',  now(), now(), actor_id, actor_id),
    ('d3000000-0000-4000-8000-000000000004', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Maria',    'Constantin',  date '2022-11-07', 'AB+', 'Alergie la polen',        null,                          null,            null,   'enrolled',  now(), now(), actor_id, actor_id),
    ('d3000000-0000-4000-8000-000000000005', kg_id, 'd2000000-0000-4000-8000-000000000001', 'David',    'Neagu',       date '2022-07-25', 'O-',  null,                      null,                          '5220725123405', 'CNP',  'enrolled',  now(), now(), actor_id, actor_id),

    ('d3000000-0000-4000-8000-000000000006', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Sofia',    'Dumitrescu',  date '2021-07-30', 'B+',  'Intoleranță la lactoză',  null,                          null,            null,   'enrolled',  now(), now(), actor_id, actor_id),
    ('d3000000-0000-4000-8000-000000000007', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Maxim',    'Rusu',        date '2021-11-23', null,  null,                      null,                          '2001123456407', 'IDNP', 'enrolled',  now(), now(), actor_id, actor_id),
    ('d3000000-0000-4000-8000-000000000008', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Ana',      'Stoica',      date '2021-03-11', 'A-',  null,                      null,                          '6210311123408', 'CNP',  'enrolled',  now(), now(), actor_id, actor_id),
    ('d3000000-0000-4000-8000-000000000009', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Matei',    'Diaconu',     date '2021-08-19', 'O+',  'Alergie la ouă',          'Meniu fără ou, confirmat.',   '5210819123409', 'CNP',  'enrolled',  now(), now(), actor_id, actor_id),
    ('d3000000-0000-4000-8000-000000000010', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Elena',    'Munteanu',    date '2021-12-05', 'B-',  null,                      null,                          null,            null,   'enrolled',  now(), now(), actor_id, actor_id),

    ('d3000000-0000-4000-8000-000000000011', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Rareș',    'Iliescu',     date '2023-04-09', 'A+',  null,                      null,                          '5230409123411', 'CNP',  'enrolled',  now(), now(), actor_id, actor_id),
    ('d3000000-0000-4000-8000-000000000012', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Daria',    'Petrescu',    date '2023-01-27', 'O+',  'Alergie la fragi',        null,                          '6230127123412', 'CNP',  'enrolled',  now(), now(), actor_id, actor_id),
    ('d3000000-0000-4000-8000-000000000013', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Tudor',    'Anghel',      date '2023-06-15', null,  null,                      'Alimentație fără gluten.',    null,            null,   'enrolled',  now(), now(), actor_id, actor_id),
    ('d3000000-0000-4000-8000-000000000014', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Ilinca',   'Sandu',       date '2023-09-21', 'AB-', null,                      null,                          '6230921123414', 'CNP',  'enrolled',  now(), now(), actor_id, actor_id),

    ('d3000000-0000-4000-8000-000000000015', kg_id, 'd2000000-0000-4000-8000-000000000004', 'Alexandru','Radu',        date '2020-10-03', 'A+',  null,                      null,                          '5201003123415', 'CNP',  'enrolled',  now(), now(), actor_id, actor_id),
    ('d3000000-0000-4000-8000-000000000016', kg_id, 'd2000000-0000-4000-8000-000000000004', 'Antonia',  'Florea',      date '2020-05-29', 'O+',  'Alergie la acarieni',     null,                          '6200529123416', 'CNP',  'enrolled',  now(), now(), actor_id, actor_id),
    ('d3000000-0000-4000-8000-000000000017', kg_id, 'd2000000-0000-4000-8000-000000000004', 'Vlad',     'Cristea',     date '2020-12-12', 'B+',  null,                      null,                          '5201212123417', 'CNP',  'enrolled',  now(), now(), actor_id, actor_id),
    ('d3000000-0000-4000-8000-000000000018', kg_id, 'd2000000-0000-4000-8000-000000000004', 'Carla',    'Voicu',       date '2020-08-08', null,  null,                      null,                          '2001208123418', 'IDNP', 'enrolled',  now(), now(), actor_id, actor_id),

    -- Unassigned + withdrawn, so "no group" and status filters have data
    ('d3000000-0000-4000-8000-000000000019', kg_id, null,                                   'Nicolae',  'Enache',      date '2021-06-17', 'A+',  null,                      null,                          null,            null,   'enrolled',  now(), now(), actor_id, actor_id),
    ('d3000000-0000-4000-8000-000000000020', kg_id, null,                                   'Teodora',  'Lungu',       date '2020-02-24', 'O+',  null,                      'Transferată la altă unitate.', null,           null,   'withdrawn', now(), now(), actor_id, actor_id)
  on conflict (id) do nothing;

  raise notice 'demo seed applied to kindergarten %', kg_id;
end $$;
