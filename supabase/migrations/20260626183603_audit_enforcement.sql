-- C2 + M1: Enforce created_by/updated_by at the DB level and write audit logs
-- for every authenticated INSERT / UPDATE on business tables.
--
-- Service-role requests (auth.uid() IS NULL) — e.g., the invite server route —
-- set these columns manually and are exempt from auto-stamping here.
-- Service-role mutations are trusted server-side flows; they are NOT written to
-- audit_logs by this trigger (the caller context lives in the app layer).

-- ============================================================================
-- TRIGGER FUNCTION: set_audit_columns
-- Stamps created_by / updated_by from auth.uid() on authenticated writes.
-- Apply to tables that carry BOTH columns (all business tables except
-- user_kindergartens, which has only created_by with no updated_by).
-- ============================================================================

create or replace function public.set_audit_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
  else
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger trg_users_audit_columns
  before insert or update on public.users
  for each row execute function public.set_audit_columns();

create trigger trg_kindergartens_audit_columns
  before insert or update on public.kindergartens
  for each row execute function public.set_audit_columns();

create trigger trg_groups_audit_columns
  before insert or update on public.groups
  for each row execute function public.set_audit_columns();

create trigger trg_children_audit_columns
  before insert or update on public.children
  for each row execute function public.set_audit_columns();

create trigger trg_parents_audit_columns
  before insert or update on public.parents
  for each row execute function public.set_audit_columns();

-- ============================================================================
-- TRIGGER FUNCTION: set_created_by
-- user_kindergartens only has created_by (no updated_by / updated_at).
-- ============================================================================

create or replace function public.set_created_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  new.created_by := auth.uid();
  return new;
end;
$$;

create trigger trg_user_kindergartens_created_by
  before insert on public.user_kindergartens
  for each row execute function public.set_created_by();

-- ============================================================================
-- TRIGGER FUNCTION: write_audit_log
-- Appends one row to audit_logs per authenticated INSERT / UPDATE.
-- Uses to_jsonb(NEW) so one function works across all business tables:
--   * tables without kindergarten_id (users) → jsonb key missing → NULL cast → NULL ✓
--   * tables with kindergarten_id → extracted as uuid ✓
-- Runs AFTER the write succeeds so only committed mutations are audited.
-- Action vocabulary:
--   create      — INSERT
--   update      — UPDATE not touching deleted_at
--   soft_delete — UPDATE that sets deleted_at (was NULL → not NULL)
--   restore     — UPDATE that clears deleted_at (was not NULL → NULL)
-- ============================================================================

create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action        text;
  v_row           jsonb;
  v_old           jsonb;
  v_kindergarten  uuid;
begin
  if auth.uid() is null then return null; end if;

  v_row := to_jsonb(new);

  if TG_OP = 'INSERT' then
    v_action := 'create';
  else
    v_old := to_jsonb(old);
    if (v_old->>'deleted_at') is null and (v_row->>'deleted_at') is not null then
      v_action := 'soft_delete';
    elsif (v_old->>'deleted_at') is not null and (v_row->>'deleted_at') is null then
      v_action := 'restore';
    else
      v_action := 'update';
    end if;
  end if;

  v_kindergarten := (v_row->>'kindergarten_id')::uuid;

  insert into public.audit_logs (user_id, kindergarten_id, action, entity, entity_id)
  values (auth.uid(), v_kindergarten, v_action, TG_TABLE_NAME, (v_row->>'id')::uuid);

  return null;
end;
$$;

create trigger trg_users_audit_log
  after insert or update on public.users
  for each row execute function public.write_audit_log();

create trigger trg_kindergartens_audit_log
  after insert or update on public.kindergartens
  for each row execute function public.write_audit_log();

create trigger trg_groups_audit_log
  after insert or update on public.groups
  for each row execute function public.write_audit_log();

create trigger trg_children_audit_log
  after insert or update on public.children
  for each row execute function public.write_audit_log();

create trigger trg_parents_audit_log
  after insert or update on public.parents
  for each row execute function public.write_audit_log();
