-- Helper functions for common operations

-- Update updated_at timestamp on record modification
create or replace function fn_update_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Log soft deletes to audit_logs table
-- Note: TG_TABLE_NAME provides the table name dynamically
create or replace function fn_audit_log_soft_delete()
returns trigger as $$
begin
  insert into audit_logs (kindergarten_id, user_id, action, entity, entity_id, created_at)
  values (old.kindergarten_id, auth.uid(), 'delete', TG_TABLE_NAME, old.id, now());
  return old;
end;
$$ language plpgsql;
