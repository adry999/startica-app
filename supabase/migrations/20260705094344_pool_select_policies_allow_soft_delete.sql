-- Soft delete on the pool tables was impossible: on this Postgres (17.x),
-- an UPDATE's NEW row must remain visible to the table's SELECT policies,
-- so a SELECT policy containing `deleted_at IS NULL` makes the very UPDATE
-- that sets deleted_at fail with "new row violates row-level security
-- policy". Verified empirically against a super_admin JWT in psql.
--
-- Fix: drop the `deleted_at IS NULL` guard from the pool_* SELECT policies.
-- Liveness filtering stays enforced in the service layer (every pool query
-- already applies `.is('deleted_at', null)`), which CLAUDE.md allows
-- ("Every read filters deleted_at IS NULL (in RLS and/or query)").
-- Tenant/role scoping is unchanged.
--
-- NOTE: guardians has the same latent bug (its UPDATE policy has no explicit
-- WITH CHECK, so its USING clause -- which includes deleted_at IS NULL -- also
-- applies to the NEW row). Not fixed here: out of this branch's scope.

drop policy pool_trainer_availability_select on public.pool_trainer_availability;
create policy pool_trainer_availability_select on public.pool_trainer_availability
  for select
  using (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or trainer_user_id = auth.uid()
      )
    )
  );

drop policy pool_schedule_patterns_select on public.pool_schedule_patterns;
create policy pool_schedule_patterns_select on public.pool_schedule_patterns
  for select
  using (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or trainer_user_id = auth.uid()
      )
    )
  );

drop policy pool_sessions_select on public.pool_sessions;
create policy pool_sessions_select on public.pool_sessions
  for select
  using (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or trainer_user_id = auth.uid()
      )
    )
  );

drop policy pool_session_participants_select on public.pool_session_participants;
create policy pool_session_participants_select on public.pool_session_participants
  for select
  using (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or exists (
          select 1 from public.pool_sessions s
          where s.id = pool_session_participants.session_id
            and s.trainer_user_id = auth.uid()
        )
      )
    )
  );
