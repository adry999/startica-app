-- supabase/migrations/20260627100000_helper_liveness_filter.sql
--
-- Security-I1: SECURITY DEFINER helpers must only recognise live users.
--
-- is_super_admin(), current_user_role(), and user_kindergarten_ids() are called
-- by every RLS policy.  Without liveness checks, a deactivated or soft-deleted
-- user whose JWT has not yet expired retains their full RLS privileges for up
-- to the JWT TTL (default 1 h).
--
-- Fix: add `AND deleted_at IS NULL AND status = 'active'` to every helper so
-- that deactivated / deleted accounts are treated as anonymous by RLS
-- immediately after the status/deleted_at change, regardless of the JWT.
--
-- user_kindergarten_ids() joins through public.users for the same reason:
-- a deleted user should not inherit any kindergarten memberships.

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role = 'super_admin'
      and status = 'active'
      and deleted_at is null
  );
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.users
  where id = auth.uid()
    and status = 'active'
    and deleted_at is null;
$$;

create or replace function public.user_kindergarten_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select uk.kindergarten_id
  from public.user_kindergartens uk
  join public.users u on u.id = uk.user_id
  where uk.user_id = auth.uid()
    and u.status = 'active'
    and u.deleted_at is null;
$$;
