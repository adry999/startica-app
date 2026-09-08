-- Add contract tracking to children
-- Allows mapping child ID to contract number + dates

alter table children
  add column contract_number text,
  add column contract_signed_at timestamptz,
  add column enrollment_start_date date;

-- Unique per kindergarten (different KGs can have same contract number format)
create unique index idx_children_contract_unique
  on children(kindergarten_id, contract_number)
  where contract_number is not null and deleted_at is null;

create index idx_children_contract_lookup
  on children(kindergarten_id, contract_number)
  where deleted_at is null;
