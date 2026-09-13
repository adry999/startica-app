-- Aggregate before PostgREST applies its response row limit. Both functions
-- run with the caller's privileges so financial RLS remains authoritative.
create or replace function public.invoice_summary(p_kindergarten_id uuid)
returns table (
  total_issued numeric,
  total_paid numeric,
  total_overdue numeric,
  pending_count bigint
)
language sql stable security invoker
set search_path = public
as $$
  select
    coalesce(sum(amount) filter (where status = 'issued'), 0),
    coalesce(sum(amount) filter (where status = 'paid'), 0),
    coalesce(sum(amount) filter (
      where status = 'overdue'
         or (status = 'issued' and due_date < (now() at time zone 'UTC')::date)
    ), 0),
    count(*) filter (where status in ('draft', 'issued', 'overdue'))
  from public.invoices
  where kindergarten_id = p_kindergarten_id and deleted_at is null;
$$;

create or replace function public.invoice_total_paid(p_invoice_id uuid)
returns numeric
language sql stable security invoker
set search_path = public
as $$
  select coalesce(sum(amount), 0)
  from public.payments
  where invoice_id = p_invoice_id
    and status = 'confirmed' and deleted_at is null;
$$;

revoke all on function public.invoice_summary(uuid) from public;
revoke all on function public.invoice_total_paid(uuid) from public;
grant execute on function public.invoice_summary(uuid) to authenticated, service_role;
grant execute on function public.invoice_total_paid(uuid) to authenticated, service_role;
-- Explicit privileges also support installations without legacy auto-grants.
grant select, insert, update on public.invoices, public.payments, public.expenses to authenticated;
