-- Bootstrap the kindergarten, then seed staff, groups and the real roster.
--
-- 20260908000009 and 20260908000010 both guarded on "a kindergarten must
-- already exist" and this project had none, so both applied as no-ops and the
-- app rendered empty (every page gates on tenantStore.selectedKindergartenId,
-- which is filled from the first kindergarten the user can read).
--
-- This migration is self-contained and supersedes both. It creates the
-- kindergarten if missing, links the Super Admin to it, then inserts 4
-- educators, 4 groups, 104 children and their primary guardians.
--
-- Educators get an auth.users row with NO password and NO auth.identities row,
-- so they appear in Staff and can be assigned to a group but CANNOT sign in.
-- Seeding usable credentials into a hosted database is what supabase/seed.sql
-- warns against; use the staff invite flow to grant real access.
--
-- Roster mapping (source: Lista_copiilor_inmatriculati.csv, 105 rows, 104 imported):
--   * "Nume/prenume copil" read surname-first: first token -> last_name,
--     remainder -> first_name (Romanian list convention).
--   * Group assigned from age on 2026-09-08 against each group's age_range
--     (2-3 Buburuze, 3-4 Fluturasi, 4-5 Albinute, 5-6 Stelute). Children
--     outside 2-6 are left unassigned rather than forced into a group.
--   * Only the primary guardian is imported; 6 source rows list a second
--     parent after a "/" which is not split out here.
--   * "Varsta" from the CSV is deliberately NOT stored -- age is derived from
--     birth_date per the project rules.
--
-- Source rows needing a human check:
--   contract 25 -> born 22.03.2018 (age 8, above kindergarten range).
--       Imported, left unassigned.
--   contract 80 -> born 29.10.2026, a future date and almost certainly a year
--       typo. NOT imported: public.children enforces
--       CHECK (birth_date >= '1990-01-01' AND birth_date <= CURRENT_DATE),
--       so the row is rejected by the database. Fix the date in the source and
--       add this child through the UI.
--
-- The kindergarten name/address below are placeholders -- rename in Settings.
--
-- Idempotent: re-running inserts nothing new.

do $$
declare
  kg_id    uuid;
  actor_id uuid;
begin
  select id into actor_id from public.users
  where role = 'super_admin' and deleted_at is null
  order by created_at limit 1;

  if actor_id is null then
    raise exception 'no super_admin user exists -- cannot seed';
  end if;

  select id into kg_id from public.kindergartens where deleted_at is null
  order by created_at limit 1;

  if kg_id is null then
    kg_id := 'd0000000-0000-4000-8000-000000000001';
    insert into public.kindergartens (id, name, address, city, phone, status, settings, created_at, updated_at, created_by, updated_by)
    values (
      kg_id, 'Gradinita Startica', 'Str. Principala nr. 1', 'Chisinau', null, 'active',
      '{"timezone":"Europe/Chisinau","default_locale":"ro","working_hours":{"start":"07:30","end":"18:00"}}'::jsonb,
      now(), now(), actor_id, actor_id
    )
    on conflict (id) do nothing;
    raise notice 'created kindergarten %', kg_id;
  end if;

  -- The Super Admin bypasses RLS via is_super_admin(), but link them anyway so
  -- the membership-based policies and the staff list behave normally.
  insert into public.user_kindergartens (user_id, kindergarten_id, created_by)
  values (actor_id, kg_id, actor_id)
  on conflict (user_id, kindergarten_id) do nothing;

  -- ── Educators (no password, no identity row -> cannot sign in) ───────────
  insert into auth.users (
    instance_id, id, aud, role, email,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
    ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'elena.popa@startica.dev',     now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'raluca.ionescu@startica.dev', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'mihaela.stan@startica.dev',   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'cristina.barbu@startica.dev', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
  on conflict (id) do nothing;

  insert into public.users (id, email, full_name, role, status, created_at, updated_at, created_by, updated_by)
  values
    ('d1000000-0000-4000-8000-000000000001', 'elena.popa@startica.dev',     'Elena Popa',     'educator', 'active', now(), now(), actor_id, actor_id),
    ('d1000000-0000-4000-8000-000000000002', 'raluca.ionescu@startica.dev', 'Raluca Ionescu', 'educator', 'active', now(), now(), actor_id, actor_id),
    ('d1000000-0000-4000-8000-000000000003', 'mihaela.stan@startica.dev',   'Mihaela Stan',   'educator', 'active', now(), now(), actor_id, actor_id),
    ('d1000000-0000-4000-8000-000000000004', 'cristina.barbu@startica.dev', 'Cristina Barbu', 'educator', 'active', now(), now(), actor_id, actor_id)
  on conflict (id) do nothing;

  insert into public.user_kindergartens (user_id, kindergarten_id, created_by)
  select u.id, kg_id, actor_id from (values
    ('d1000000-0000-4000-8000-000000000001'::uuid),
    ('d1000000-0000-4000-8000-000000000002'::uuid),
    ('d1000000-0000-4000-8000-000000000003'::uuid),
    ('d1000000-0000-4000-8000-000000000004'::uuid)
  ) as u(id)
  on conflict (user_id, kindergarten_id) do nothing;

  -- ── Groups (one educator each) ──────────────────────────────────────────
  insert into public.groups (id, kindergarten_id, name, age_range, educator_id, status, created_at, updated_at, created_by, updated_by)
  values
    ('d2000000-0000-4000-8000-000000000001', kg_id, 'Fluturasi', '3-4 ani', 'd1000000-0000-4000-8000-000000000001', 'active', now(), now(), actor_id, actor_id),
    ('d2000000-0000-4000-8000-000000000002', kg_id, 'Albinute',  '4-5 ani', 'd1000000-0000-4000-8000-000000000002', 'active', now(), now(), actor_id, actor_id),
    ('d2000000-0000-4000-8000-000000000003', kg_id, 'Buburuze',  '2-3 ani', 'd1000000-0000-4000-8000-000000000003', 'active', now(), now(), actor_id, actor_id),
    ('d2000000-0000-4000-8000-000000000004', kg_id, 'Stelute',   '5-6 ani', 'd1000000-0000-4000-8000-000000000004', 'active', now(), now(), actor_id, actor_id)
  on conflict (id) do nothing;

  -- ── Children (real roster) ──────────────────────────────────────────────
  insert into public.children (
    id, kindergarten_id, group_id, first_name, last_name, birth_date, status,
    created_at, updated_at, created_by, updated_by
  ) values
    ('d4000000-0000-4000-8000-000000000001', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Hudic', 'Amedeia', date '2022-12-04', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000002', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Panaghiu', 'Mark', date '2023-01-25', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000003', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Cerba', 'Alexander', date '2022-04-25', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000004', kg_id, 'd2000000-0000-4000-8000-000000000004', 'Repeah', 'Raluca', date '2020-12-09', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000005', kg_id, 'd2000000-0000-4000-8000-000000000004', 'Lungu', 'Luca', date '2020-10-10', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000006', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Vajnik (cresa)', 'David', date '2022-11-30', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000007', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Slivinschi', 'Sophia', date '2021-11-24', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000008', kg_id, 'd2000000-0000-4000-8000-000000000004', 'Cotirau', 'Lilly-Celine', date '2021-01-01', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000009', kg_id, null, 'Ratmir', 'Cotlau', date '2019-11-24', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000010', kg_id, null, 'Ursu', 'Maximilian', date '2018-11-28', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000011', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Renesma', 'Doros', date '2021-10-10', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000012', kg_id, null, 'Stefania', 'Cotorobai', date '2020-02-05', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000013', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Monica', 'Coada', date '2022-11-25', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000014', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Iris', 'Racila', date '2023-02-21', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000015', kg_id, null, 'Vlad', 'Cebotari', date '2019-08-19', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000016', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Lucas', 'Farima', date '2023-02-18', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000017', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Ian', 'Nichitin', date '2022-02-21', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000018', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Maxim', 'Crudu', date '2023-04-30', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000019', kg_id, null, 'Calmis', 'Leia', date '2019-02-26', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000020', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Ilinca', 'Lucinschi', date '2022-09-29', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000021', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Vera', 'Balanuta', date '2022-06-10', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000022', kg_id, null, 'Elizaveta', 'Startulat', date '2019-05-31', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000023', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Cristian', 'Colesnicenco', date '2022-01-18', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000024', kg_id, null, 'Timur', 'Talmatchi', date '2020-04-03', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000025', kg_id, null, 'Marius', 'Tcacenco', date '2018-03-22', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000026', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Constantin', 'Siromeat', date '2022-12-19', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000027', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Iustina', 'Brinza', date '2023-07-24', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000028', kg_id, 'd2000000-0000-4000-8000-000000000004', 'Deea', 'Coscodan', date '2020-10-10', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000029', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Vasile', 'Oprea', date '2022-04-05', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000030', kg_id, 'd2000000-0000-4000-8000-000000000004', 'Victor', 'Ghilescu', date '2020-09-27', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000031', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Baiesu', 'Stelian', date '2022-11-25', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000032', kg_id, null, 'Daniel', 'Rogozynskii', date '2020-03-05', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000033', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Savelii', 'Tarasenco', date '2021-11-04', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000034', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Ilinca', 'Balan', date '2022-09-21', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000035', kg_id, null, 'Amelia', 'Cacean', date '2020-03-22', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000036', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Kiril', 'Kolmogortsev', date '2021-10-20', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000037', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Gabriel', 'Ciubuc', date '2023-11-20', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000038', kg_id, null, 'Polina', 'Jidobina', date '2019-09-04', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000039', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Timofei', 'Eremia', date '2023-10-24', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000040', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Savva', 'Russu', date '2022-07-12', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000041', kg_id, 'd2000000-0000-4000-8000-000000000004', 'Rian', 'Raiu', date '2021-04-21', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000042', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Maria', 'Turyk', date '2021-10-12', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000043', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Alex', 'Emandei', date '2023-04-14', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000044', kg_id, null, 'Mark', 'Cemortan', date '2020-03-09', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000045', kg_id, null, 'Razvan', 'Grosu', date '2020-06-02', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000046', kg_id, null, 'Ilinca', 'Grosu', date '2020-06-02', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000047', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Ratmir', 'Muras', date '2023-06-10', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000048', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Eva', 'Cumanov', date '2023-06-16', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000049', kg_id, 'd2000000-0000-4000-8000-000000000004', 'Platon', 'Gherghisan', date '2021-08-24', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000050', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Martin', 'Novenco', date '2022-02-16', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000051', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Calin', 'Nemtanu', date '2023-07-28', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000052', kg_id, null, 'Matvei', 'Girjev', date '2020-03-25', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000053', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Alex', 'Vicol', date '2023-12-22', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000054', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Maxim', 'Bucatari', date '2023-12-07', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000055', kg_id, null, 'David', 'Buliga', date '2019-04-24', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000056', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Edvin', 'Niurkin', date '2023-03-03', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000057', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Maria', 'Avram', date '2023-06-05', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000058', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Artemii', 'Deli', date '2023-06-15', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000059', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Matteo', 'Chitac', date '2023-09-30', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000060', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Daria', 'Patrachi', date '2024-01-10', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000061', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Iacob', 'Pelin', date '2023-06-02', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000062', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Elina', 'Podac', date '2023-02-12', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000063', kg_id, null, 'Roman', 'Mindru', date '2019-12-15', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000064', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Adele', 'Tihonov', date '2023-09-25', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000065', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Mark', 'Mihalev', date '2022-08-29', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000066', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Luca', 'Bolun', date '2023-03-19', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000067', kg_id, 'd2000000-0000-4000-8000-000000000004', 'Alisa', 'Cocerva', date '2021-02-21', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000068', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Damian', 'Rinja', date '2024-03-01', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000069', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Leonard', 'Tomilin', date '2023-02-25', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000070', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Alex', 'Racu-Armasu', date '2023-12-08', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000071', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Varvara', 'Godai', date '2024-02-01', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000072', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Kira', 'Munteanu', date '2022-01-03', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000073', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Stefan', 'Vladica', date '2022-05-04', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000074', kg_id, null, 'Victor', 'Panteliciuc', date '2024-09-10', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000075', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Timur', 'Conea', date '2022-06-21', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000076', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Ovidiu', 'Cujba', date '2022-09-11', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000077', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Mira', 'Melnic', date '2024-08-30', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000078', kg_id, 'd2000000-0000-4000-8000-000000000004', 'Timur', 'Bagnyuk', date '2021-07-20', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000079', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Luca', 'Russu', date '2023-02-10', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000081', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Adam', 'Gordienco', date '2023-06-19', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000082', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Rares Gabriel', 'Bivol', date '2023-04-06', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000083', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Emilia', 'Miliniok', date '2024-02-07', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000084', kg_id, null, 'Ion', 'Ionas', date '2024-10-12', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000085', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Ioan', 'Valuta', date '2023-07-24', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000086', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Artur', 'Leonciuc', date '2024-07-03', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000087', kg_id, null, 'Thea', 'Vasilca', date '2024-10-20', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000088', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Amelia', 'Trofimova', date '2023-08-02', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000089', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Lev', 'Stankov', date '2021-12-10', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000090', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Mark', 'Stankov', date '2024-08-09', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000091', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Bogdan', 'Plugaru', date '2022-04-29', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000092', kg_id, 'd2000000-0000-4000-8000-000000000004', 'Mark', 'Horbatiuk', date '2021-01-08', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000093', kg_id, null, 'Patricia', 'Muradu', date '2025-10-20', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000094', kg_id, 'd2000000-0000-4000-8000-000000000004', 'Letizia', 'Muradu', date '2020-09-17', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000095', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Gloria', 'Comerzan', date '2024-04-02', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000096', kg_id, 'd2000000-0000-4000-8000-000000000001', 'Mark', 'Florea', date '2023-05-10', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000097', kg_id, null, 'Arthur', 'Cerba', date '2024-09-27', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000098', kg_id, null, 'Mia', 'Papadia', date '2024-12-26', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000099', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Maxim', 'Botica', date '2021-09-14', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000100', kg_id, null, 'Mihail', 'Sukhariev', date '2024-09-13', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000101', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Damir', 'Malishev', date '2024-01-14', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000102', kg_id, 'd2000000-0000-4000-8000-000000000002', 'David', 'Tiju', date '2021-12-27', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000103', kg_id, 'd2000000-0000-4000-8000-000000000003', 'Stefan', 'Taburceanu', date '2023-10-18', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000104', kg_id, null, 'Teodor', 'Gidilica', date '2025-03-18', 'enrolled', now(), now(), actor_id, actor_id),
    ('d4000000-0000-4000-8000-000000000105', kg_id, 'd2000000-0000-4000-8000-000000000002', 'Elizaveta', 'Gorea', date '2022-04-04', 'enrolled', now(), now(), actor_id, actor_id)
  on conflict (id) do nothing;

  -- ── Primary guardians ───────────────────────────────────────────────────
  insert into public.guardians (
    id, child_id, kindergarten_id, first_name, last_name, phone,
    relationship, is_primary, created_at, updated_at, created_by, updated_by
  ) values
    ('d5000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', kg_id, 'Nicolae', 'Hudic', '68410411', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000002', kg_id, 'Vasile', 'Panaghiu', '60221221', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000003', kg_id, 'Pavel', 'Cerba', '68833888', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000004', 'd4000000-0000-4000-8000-000000000004', kg_id, 'Ludmila', 'Repeah', '69823770', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000005', 'd4000000-0000-4000-8000-000000000005', kg_id, 'Alina', 'Lungu', '69736019', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000006', 'd4000000-0000-4000-8000-000000000006', kg_id, 'Alina', 'Vajnik', '78765279', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000007', 'd4000000-0000-4000-8000-000000000007', kg_id, 'Elena', 'Slivinschi', '68444488', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000008', 'd4000000-0000-4000-8000-000000000008', kg_id, 'Gabriela', 'Oglinda-Cotirau', '78899001', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000009', 'd4000000-0000-4000-8000-000000000009', kg_id, 'Irina', 'Cotlau', '76678987', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000010', 'd4000000-0000-4000-8000-000000000010', kg_id, 'Vadim', 'Ursu', '78122221', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000011', 'd4000000-0000-4000-8000-000000000011', kg_id, 'Luminita', 'Dondea', '78050509', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000012', 'd4000000-0000-4000-8000-000000000012', kg_id, 'Alina', 'Cotorobai', '79647273', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000013', 'd4000000-0000-4000-8000-000000000013', kg_id, 'Marinela', 'Coada', '69754707', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000014', 'd4000000-0000-4000-8000-000000000014', kg_id, 'Stela', 'Cotaga', '79146626', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000015', 'd4000000-0000-4000-8000-000000000015', kg_id, 'Mariana', 'Cebotari', '69121157', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000016', 'd4000000-0000-4000-8000-000000000016', kg_id, 'Lupascu', 'Parascovia', '68421811', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000017', 'd4000000-0000-4000-8000-000000000017', kg_id, 'Anastasia', 'Nichitin', '79291366', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000018', 'd4000000-0000-4000-8000-000000000018', kg_id, 'Anastasia', 'Crudu', '69993600', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000019', 'd4000000-0000-4000-8000-000000000019', kg_id, 'Tiganova', 'Evghenia', '60655101', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000020', 'd4000000-0000-4000-8000-000000000020', kg_id, 'Cristina', 'Lucinschi', '69568086', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000021', 'd4000000-0000-4000-8000-000000000021', kg_id, 'Dumitru', 'Balanuta', '69333309', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000022', 'd4000000-0000-4000-8000-000000000022', kg_id, 'Natalia', 'Cebonenco', '68052101', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000023', 'd4000000-0000-4000-8000-000000000023', kg_id, 'Elena', 'Stefanova', '76005599', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000024', 'd4000000-0000-4000-8000-000000000024', kg_id, 'Arina', 'Talmatchi', '68586652', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000025', 'd4000000-0000-4000-8000-000000000025', kg_id, 'Maria', 'Tcacenco', '79469625', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000026', 'd4000000-0000-4000-8000-000000000026', kg_id, 'Alexandra', 'Siromeat', '78599999', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000027', 'd4000000-0000-4000-8000-000000000027', kg_id, 'Mircea', 'Brinza', '79050010', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000028', 'd4000000-0000-4000-8000-000000000028', kg_id, 'Anastasia', 'Coscodan', '78185178', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000029', 'd4000000-0000-4000-8000-000000000029', kg_id, 'Olesea', 'Golban', '76777798', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000030', 'd4000000-0000-4000-8000-000000000030', kg_id, 'Elena', 'Covalciuc', '67424207', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000031', 'd4000000-0000-4000-8000-000000000031', kg_id, 'Alexandru', 'Baiesu', '69620139', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000032', 'd4000000-0000-4000-8000-000000000032', kg_id, 'Olga', 'Rogozinskaia', '69671250', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000033', 'd4000000-0000-4000-8000-000000000033', kg_id, 'Irina', 'Tarasenco', '68888912', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000034', 'd4000000-0000-4000-8000-000000000034', kg_id, 'Lilia', 'Balan', '61000444', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000035', 'd4000000-0000-4000-8000-000000000035', kg_id, 'Elena', 'Bordian', '69068423', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000036', 'd4000000-0000-4000-8000-000000000036', kg_id, 'Karina', 'Kolmogortseva', '76634637', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000037', 'd4000000-0000-4000-8000-000000000037', kg_id, 'Natalia', 'Ciubuc', '69929248', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000038', 'd4000000-0000-4000-8000-000000000038', kg_id, 'Igor', 'Jidobin', '78340000', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000039', 'd4000000-0000-4000-8000-000000000039', kg_id, 'Viorel', 'Eremia', '69403879', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000040', 'd4000000-0000-4000-8000-000000000040', kg_id, 'Ecaterina', 'Russu', '69338773', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000041', 'd4000000-0000-4000-8000-000000000041', kg_id, 'Ion', 'Raiu', '78787575', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000042', 'd4000000-0000-4000-8000-000000000042', kg_id, 'Mykola', 'Turyk', '60953281', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000043', 'd4000000-0000-4000-8000-000000000043', kg_id, 'Victoria', 'Timotin', '60508833', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000044', 'd4000000-0000-4000-8000-000000000044', kg_id, 'Daria', 'Gutu', '76611999', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000045', 'd4000000-0000-4000-8000-000000000045', kg_id, 'Mariana', 'Macari', '78805157', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000046', 'd4000000-0000-4000-8000-000000000046', kg_id, 'Mariana', 'Macari', '78805157', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000047', 'd4000000-0000-4000-8000-000000000047', kg_id, 'Djulietta', 'Muras', '69808205', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000048', 'd4000000-0000-4000-8000-000000000048', kg_id, 'Eugenia', 'Topa', '60505059', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000049', 'd4000000-0000-4000-8000-000000000049', kg_id, 'Olga', 'Curilcenco', '67488486', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000050', 'd4000000-0000-4000-8000-000000000050', kg_id, 'Gabriela', 'Novenco', '78290468', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000051', 'd4000000-0000-4000-8000-000000000051', kg_id, 'Antonela', 'Nemtanu', '69899647', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000052', 'd4000000-0000-4000-8000-000000000052', kg_id, 'Anton', 'Girjev', '79709655', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000053', 'd4000000-0000-4000-8000-000000000053', kg_id, 'Dana', 'Vicol', '69205544', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000054', 'd4000000-0000-4000-8000-000000000054', kg_id, 'Doina', 'Levitchi', '79212391', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000055', 'd4000000-0000-4000-8000-000000000055', kg_id, 'Natalia', 'Saramet', '69262803', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000056', 'd4000000-0000-4000-8000-000000000056', kg_id, 'Tetiana', 'Brodiuk', '60903399', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000057', 'd4000000-0000-4000-8000-000000000057', kg_id, 'Valentin', 'Avram', '69111546', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000058', 'd4000000-0000-4000-8000-000000000058', kg_id, 'Galina', 'Deli', '79510475', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000059', 'd4000000-0000-4000-8000-000000000059', kg_id, 'Igor', 'Chitac', '60599534', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000060', 'd4000000-0000-4000-8000-000000000060', kg_id, 'Ana', 'Patrachi', '69367080', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000061', 'd4000000-0000-4000-8000-000000000061', kg_id, 'Cristian', 'Pelin', '69394266', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000062', 'd4000000-0000-4000-8000-000000000062', kg_id, 'Olga', 'Raetchi', '69500144', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000063', 'd4000000-0000-4000-8000-000000000063', kg_id, 'Oxana', 'Mindru', '69198867', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000064', 'd4000000-0000-4000-8000-000000000064', kg_id, 'Iana', 'Tihonov', '60005422', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000065', 'd4000000-0000-4000-8000-000000000065', kg_id, 'Alina', 'Samson', '68655557', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000066', 'd4000000-0000-4000-8000-000000000066', kg_id, 'Vadim', 'Bolun', '68376828', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000067', 'd4000000-0000-4000-8000-000000000067', kg_id, 'Denis', 'Cocerva', '62178139', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000068', 'd4000000-0000-4000-8000-000000000068', kg_id, 'Andrei', 'Rinja', '60222700', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000069', 'd4000000-0000-4000-8000-000000000069', kg_id, 'Alexandru', 'Tomilin', '79268097', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000070', 'd4000000-0000-4000-8000-000000000070', kg_id, 'Stanislav', 'Racu-Armasu', '78014418', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000071', 'd4000000-0000-4000-8000-000000000071', kg_id, 'Anastasia', 'Godai', '69307970', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000072', 'd4000000-0000-4000-8000-000000000072', kg_id, 'Cristina', 'Slyvko', '76049795', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000073', 'd4000000-0000-4000-8000-000000000073', kg_id, 'Marcela', 'Vladica', '69747622', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000074', 'd4000000-0000-4000-8000-000000000074', kg_id, 'Victor', 'Panteliciuc', '60529093', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000075', 'd4000000-0000-4000-8000-000000000075', kg_id, 'Mihaela', 'Conea', null, 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000076', 'd4000000-0000-4000-8000-000000000076', kg_id, 'Olesea', 'Cujba', '69188146', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000077', 'd4000000-0000-4000-8000-000000000077', kg_id, 'Iulia', 'Melnic', null, 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000078', 'd4000000-0000-4000-8000-000000000078', kg_id, 'Iulia', 'Bagnyuk', '79053780', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000079', 'd4000000-0000-4000-8000-000000000079', kg_id, 'Constantin', 'Russu', '69955625', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000081', 'd4000000-0000-4000-8000-000000000081', kg_id, 'Victor', 'Gordienco', '78130255', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000082', 'd4000000-0000-4000-8000-000000000082', kg_id, 'Marta', 'Bivol', '69252911', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000083', 'd4000000-0000-4000-8000-000000000083', kg_id, 'Natalia', 'Milinok', '79068113', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000084', 'd4000000-0000-4000-8000-000000000084', kg_id, 'Lidia', 'Ionas', '69850555', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000085', 'd4000000-0000-4000-8000-000000000085', kg_id, 'Ioan', 'Valuta', '67477777', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000086', 'd4000000-0000-4000-8000-000000000086', kg_id, 'Artur', 'Leonciuc', '69735444', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000087', 'd4000000-0000-4000-8000-000000000087', kg_id, 'Thea', 'Vasilca', '62030535', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000088', 'd4000000-0000-4000-8000-000000000088', kg_id, 'Amelia', 'Trofimova', '78898974', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000089', 'd4000000-0000-4000-8000-000000000089', kg_id, 'Lev', 'Semenciuk', '76529282', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000090', 'd4000000-0000-4000-8000-000000000090', kg_id, 'Mark', 'Semenciuk', '76529282', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000091', 'd4000000-0000-4000-8000-000000000091', kg_id, 'Bogdan', 'Plugaru', '60162686', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000092', 'd4000000-0000-4000-8000-000000000092', kg_id, 'Mark', 'Horbatiuk', '62045828', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000093', 'd4000000-0000-4000-8000-000000000093', kg_id, 'Iurie', 'Muradu', '68233346', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000094', 'd4000000-0000-4000-8000-000000000094', kg_id, 'Iurie', 'Muradu', '68233346', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000095', 'd4000000-0000-4000-8000-000000000095', kg_id, 'Gloria', 'Comerzan', '79525429', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000096', 'd4000000-0000-4000-8000-000000000096', kg_id, 'Mark', 'Florea', '68706228', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000097', 'd4000000-0000-4000-8000-000000000097', kg_id, 'Arthur', 'Cerba', '68833888', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000098', 'd4000000-0000-4000-8000-000000000098', kg_id, 'Mia', 'Papadia', '60942976', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000099', 'd4000000-0000-4000-8000-000000000099', kg_id, 'Maxim', 'Botica', '69062405', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000100', 'd4000000-0000-4000-8000-000000000100', kg_id, 'Mihail', 'Sukhariev', '79904933', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000101', kg_id, 'Damir', 'Malishev', '78504403', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000102', 'd4000000-0000-4000-8000-000000000102', kg_id, 'David', 'Tiju', '68426231', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000103', 'd4000000-0000-4000-8000-000000000103', kg_id, 'Stefan', 'Taburceanu', '67191108', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000104', 'd4000000-0000-4000-8000-000000000104', kg_id, 'Teodor', 'Gidilica', '79811787', 'guardian', true, now(), now(), actor_id, actor_id),
    ('d5000000-0000-4000-8000-000000000105', 'd4000000-0000-4000-8000-000000000105', kg_id, 'Elizaveta', 'Gorea', '60449992', 'guardian', true, now(), now(), actor_id, actor_id)
  on conflict (id) do nothing;

  raise notice 'seeded kindergarten %', kg_id;
end $$;
