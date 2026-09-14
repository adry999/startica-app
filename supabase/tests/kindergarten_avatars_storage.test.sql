-- Regression coverage for 20260914000001_kindergarten_avatars_super_admin_writes.sql.
-- Run with: npm run test:db -- --filter kindergarten_avatars_storage

begin;
select plan(9);

-- Hosted Supabase enables RLS on storage.objects; the PGlite stand-in table does not.
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;

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
  ('e3000000-0000-4000-8000-000000000001'::uuid, 'logo-super@test.local'),
  ('e3000000-0000-4000-8000-000000000002'::uuid, 'logo-admin@test.local'),
  ('e3000000-0000-4000-8000-000000000003'::uuid, 'logo-inactive-super@test.local')
) as fixture(id, email);

insert into public.users (id, email, full_name, role, status)
values
  ('e3000000-0000-4000-8000-000000000001', 'logo-super@test.local', 'Super', 'super_admin', 'active'),
  ('e3000000-0000-4000-8000-000000000002', 'logo-admin@test.local', 'Admin', 'admin', 'active'),
  ('e3000000-0000-4000-8000-000000000003', 'logo-inactive-super@test.local', 'Inactive Super', 'super_admin', 'inactive');

insert into public.kindergartens (id, name, status, settings)
values ('f3000000-0000-4000-8000-000000000001', 'Logo A', 'active', '{}'::jsonb);

insert into public.user_kindergartens (user_id, kindergarten_id)
values ('e3000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000001');

set local role authenticated;

set local "request.jwt.claims" = '{"sub":"e3000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('kindergarten-avatars', 'f3000000-0000-4000-8000-000000000001.png')$$,
  'a super admin uploads a kindergarten logo'
);

set local "request.jwt.claims" = '{"sub":"e3000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('kindergarten-avatars', 'f3000000-0000-4000-8000-000000000001.jpg')$$,
  '42501', null, 'an admin cannot upload a kindergarten logo'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'kindergarten-avatars' and name = 'f3000000-0000-4000-8000-000000000001.png'),
  1::bigint,
  'an admin can still read kindergarten logos'
);
update storage.objects set name = 'overwritten-by-admin.png' where bucket_id = 'kindergarten-avatars';
select is(
  (select count(*) from storage.objects where bucket_id = 'kindergarten-avatars' and name = 'overwritten-by-admin.png'),
  0::bigint,
  'an admin cannot rename or overwrite a kindergarten logo'
);
delete from storage.objects where bucket_id = 'kindergarten-avatars';

set local "request.jwt.claims" = '{"sub":"e3000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('kindergarten-avatars', 'f3000000-0000-4000-8000-000000000001.gif')$$,
  '42501', null, 'an inactive super admin cannot upload a kindergarten logo'
);

reset role;
reset "request.jwt.claims";

select is(
  (select count(*) from storage.objects where bucket_id = 'kindergarten-avatars' and name = 'f3000000-0000-4000-8000-000000000001.png'),
  1::bigint,
  'an admin cannot delete a kindergarten logo'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"e3000000-0000-4000-8000-000000000001","role":"authenticated"}';
update storage.objects set metadata = '{"size":1}'::jsonb
  where bucket_id = 'kindergarten-avatars' and name = 'f3000000-0000-4000-8000-000000000001.png';
select is(
  (select metadata from storage.objects where bucket_id = 'kindergarten-avatars' and name = 'f3000000-0000-4000-8000-000000000001.png'),
  '{"size":1}'::jsonb,
  'a super admin overwrites a kindergarten logo'
);
delete from storage.objects
  where bucket_id = 'kindergarten-avatars' and name = 'f3000000-0000-4000-8000-000000000001.png';

reset role;
reset "request.jwt.claims";

select is(
  (select count(*) from storage.objects where bucket_id = 'kindergarten-avatars'),
  0::bigint,
  'a super admin deletes a kindergarten logo'
);
select policies_are(
  'storage',
  'objects',
  array[
    'Public read access',
    'kindergarten_avatars_insert',
    'kindergarten_avatars_update',
    'kindergarten_avatars_delete'
  ],
  'the permissive authenticated-only write policies are gone'
);

select * from finish();
rollback;
