-- Fix RLS on financial tables (invoices, payments, expenses).
--
-- Three defects in the original policies:
--   1. `auth.jwt()->>'role' = 'super_admin'` never matches. That claim holds
--      the Postgres role ('authenticated'), not the app role, so the Super
--      Admin branch was dead code. The project helper is public.is_super_admin().
--   2. No role restriction: any member of the kindergarten -- including an
--      educator -- could read and write financial records.
--   3. A `for delete` policy allowed hard deletes, and the select policies
--      did not filter soft-deleted rows.
--
-- Financial data is Admin / Super Admin only. Educators lose access entirely.
-- Delete policies are dropped: these tables are soft-delete only, matching
-- public.children and the rest of the schema.

-- ── invoices ────────────────────────────────────────────────────────────────
drop policy if exists "invoices_select" on public.invoices;
drop policy if exists "invoices_insert" on public.invoices;
drop policy if exists "invoices_update" on public.invoices;
drop policy if exists "invoices_delete" on public.invoices;

create policy invoices_select on public.invoices
  for select
  using (
    deleted_at is null
    and (
      public.is_super_admin()
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and public.current_user_role() = 'admin'
      )
    )
  );

create policy invoices_insert on public.invoices
  for insert
  with check (
    public.is_super_admin()
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and public.current_user_role() = 'admin'
    )
  );

create policy invoices_update on public.invoices
  for update
  using (
    public.is_super_admin()
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and public.current_user_role() = 'admin'
    )
  );

-- ── payments ────────────────────────────────────────────────────────────────
drop policy if exists payments_select on public.payments;
drop policy if exists payments_insert on public.payments;
drop policy if exists payments_update on public.payments;
drop policy if exists payments_delete on public.payments;

create policy payments_select on public.payments
  for select
  using (
    deleted_at is null
    and (
      public.is_super_admin()
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and public.current_user_role() = 'admin'
      )
    )
  );

create policy payments_insert on public.payments
  for insert
  with check (
    public.is_super_admin()
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and public.current_user_role() = 'admin'
    )
  );

create policy payments_update on public.payments
  for update
  using (
    public.is_super_admin()
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and public.current_user_role() = 'admin'
    )
  );

-- ── expenses ────────────────────────────────────────────────────────────────
drop policy if exists expenses_select on public.expenses;
drop policy if exists expenses_insert on public.expenses;
drop policy if exists expenses_update on public.expenses;
drop policy if exists expenses_delete on public.expenses;

create policy expenses_select on public.expenses
  for select
  using (
    deleted_at is null
    and (
      public.is_super_admin()
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and public.current_user_role() = 'admin'
      )
    )
  );

create policy expenses_insert on public.expenses
  for insert
  with check (
    public.is_super_admin()
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and public.current_user_role() = 'admin'
    )
  );

create policy expenses_update on public.expenses
  for update
  using (
    public.is_super_admin()
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and public.current_user_role() = 'admin'
    )
  );

-- Revoke client-facing hard delete. service_role keeps it for the GDPR
-- anonymization path, which bypasses RLS deliberately.
revoke delete on public.invoices from authenticated;
revoke delete on public.payments from authenticated;
revoke delete on public.expenses from authenticated;
