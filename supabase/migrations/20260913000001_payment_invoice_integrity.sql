-- A payment may only be recorded against a live issued, overdue or paid invoice;
-- a paid invoice can still receive further payments. Draft, cancelled and
-- soft-deleted invoices never accept one, including from stale screens or
-- hand-crafted requests. Tenant alignment stays with the composite
-- payments_invoice_id_fkey.
create or replace function public.ensure_payment_invoice_is_payable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Confirming or failing an existing payment must still work after its invoice is cancelled.
  if tg_op = 'UPDATE' and new.invoice_id = old.invoice_id then
    return new;
  end if;

  -- The share lock keeps the invoice from being cancelled or deleted until this payment commits.
  perform 1
  from public.invoices
  where id = new.invoice_id
    and deleted_at is null
    and status in ('issued', 'overdue', 'paid')
  for share;

  if not found then
    raise exception 'invoice % does not accept payments', new.invoice_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger payments_invoice_payable
  before insert or update of invoice_id on public.payments
  for each row execute function public.ensure_payment_invoice_is_payable();

-- Aggregate before PostgREST applies its response row limit; runs with the
-- caller's privileges so financial RLS remains authoritative.
create or replace function public.payment_summary(p_kindergarten_id uuid)
returns table (
  confirmed_total numeric,
  pending_count bigint,
  confirmed_count bigint,
  failed_count bigint
)
language sql stable security invoker
set search_path = public
as $$
  select
    coalesce(sum(amount) filter (where status = 'confirmed'), 0),
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'confirmed'),
    count(*) filter (where status = 'failed')
  from public.payments
  where kindergarten_id = p_kindergarten_id and deleted_at is null;
$$;

revoke all on function public.ensure_payment_invoice_is_payable() from public;
revoke all on function public.payment_summary(uuid) from public;
grant execute on function public.payment_summary(uuid) to authenticated, service_role;
