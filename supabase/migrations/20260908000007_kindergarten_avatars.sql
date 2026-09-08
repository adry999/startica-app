-- Enable storage for kindergarten avatars
-- Note: logo_url column already exists on kindergartens table

-- Create storage bucket if not exists
insert into storage.buckets (id, name, public)
values ('kindergarten-avatars', 'kindergarten-avatars', true)
on conflict (id) do nothing;

-- RLS policies for avatar bucket
create policy "Public read access"
  on storage.objects for select
  using (bucket_id = 'kindergarten-avatars');

create policy "Authenticated upload"
  on storage.objects for insert
  with check (
    bucket_id = 'kindergarten-avatars'
    and auth.role() = 'authenticated'
  );

create policy "Owner update"
  on storage.objects for update
  using (
    bucket_id = 'kindergarten-avatars'
    and auth.role() = 'authenticated'
  );

create policy "Owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'kindergarten-avatars'
    and auth.role() = 'authenticated'
  );
