-- Compute expense totals in the database.
--
-- getSummary() previously selected every expense row and summed them in JS.
-- PostgREST caps a response at 1000 rows by default, so once a kindergarten
-- passed that many expenses the totals silently under-reported: with 1201 rows
-- imported the UI showed 1,402,859 lei against an actual 1,564,059.
--
-- Aggregating server-side is both correct and O(1) over the wire.
--
-- security invoker so the caller's RLS still applies -- this must not become a
-- way to read another kindergarten's finances.

create or replace function public.expense_summary(p_kindergarten_id uuid)
returns table (
  total_spent    numeric,
  total_approved numeric,
  total_pending  numeric,
  by_category    jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with visible as (
    select category, status, amount
    from public.expenses
    where kindergarten_id = p_kindergarten_id
      and deleted_at is null
  )
  select
    coalesce(sum(amount) filter (where status in ('approved', 'draft')), 0),
    coalesce(sum(amount) filter (where status = 'approved'), 0),
    coalesce(sum(amount) filter (where status = 'draft'), 0),
    coalesce(
      (select jsonb_object_agg(category, total)
       from (select category, sum(amount) as total from visible group by category) c),
      '{}'::jsonb
    )
  from visible;
$$;

grant execute on function public.expense_summary(uuid) to authenticated, service_role;
