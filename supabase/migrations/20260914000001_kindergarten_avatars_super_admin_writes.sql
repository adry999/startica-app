-- Kindergarten logos may be written only by whoever may update the kindergarten.
-- kindergartens_update allows a super admin only; the previous storage policies let any
-- signed-in user insert, overwrite or delete any file in the bucket. Public read stays.

drop policy if exists "Authenticated upload" on storage.objects;
drop policy if exists "Owner update" on storage.objects;
drop policy if exists "Owner delete" on storage.objects;

create policy kindergarten_avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kindergarten-avatars'
    and (select public.is_super_admin())
  );

create policy kindergarten_avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'kindergarten-avatars'
    and (select public.is_super_admin())
  )
  with check (
    bucket_id = 'kindergarten-avatars'
    and (select public.is_super_admin())
  );

create policy kindergarten_avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'kindergarten-avatars'
    and (select public.is_super_admin())
  );
