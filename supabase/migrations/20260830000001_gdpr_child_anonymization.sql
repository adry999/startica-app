-- GDPR right-to-erasure: keep the operational/audit record while removing
-- child and guardian PII. The function is deliberately server-authenticated;
-- direct clients cannot choose arbitrary actor or tenant identifiers.
create or replace function public.anonymize_child(p_child_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kindergarten_id uuid;
begin
  select kindergarten_id into v_kindergarten_id
  from public.children
  where id = p_child_id and deleted_at is null;

  if v_kindergarten_id is null then
    raise exception 'child not found' using errcode = 'P0002';
  end if;

  if not (
    public.is_super_admin()
    or (
      public.current_user_role() = 'admin'
      and v_kindergarten_id in (select public.user_kindergarten_ids())
    )
  ) then
    raise exception 'not authorized to anonymize this child' using errcode = '42501';
  end if;

  update public.guardians
  set first_name = 'Anonymized', last_name = 'Guardian', email = null,
      phone = null, notes = null, is_primary = false, deleted_at = now(),
      updated_by = auth.uid()
  where child_id = p_child_id and deleted_at is null;

  update public.parents
  set full_name = 'Anonymized contact', email = null, phone = null,
      relationship = null, deleted_at = now(), updated_by = auth.uid()
  where child_id = p_child_id and deleted_at is null;

  update public.children
  set first_name = 'Anonymized', last_name = 'Child',
      -- birth_date is NOT NULL in the V1 schema; a sentinel removes the
      -- original value while preserving the historic schema invariant.
      birth_date = date '1900-01-01', group_id = null, blood_group = null,
      allergies = null, medical_notes = null, national_id = null,
      id_type = null, consent = '{}'::jsonb, retention_until = null,
      status = 'withdrawn', deleted_at = now(), updated_by = auth.uid()
  where id = p_child_id;

  insert into public.audit_logs (user_id, kindergarten_id, action, entity, entity_id)
  values (auth.uid(), v_kindergarten_id, 'anonymize', 'children', p_child_id);
end;
$$;

revoke all on function public.anonymize_child(uuid) from public;
grant execute on function public.anonymize_child(uuid) to authenticated;
