-- The guardians UPDATE policy was missing `deleted_at IS NULL` in its USING clause,
-- allowing writes to soft-deleted rows. Re-create the policy with the correct guard.
drop policy if exists "guardians: update own kindergarten" on public.guardians;

create policy "guardians: update own kindergarten"
  on public.guardians for update to authenticated
  using (
    kindergarten_id in (
      select kindergarten_id from public.user_kindergartens where user_id = auth.uid()
    )
    and deleted_at is null
  );
