-- Staff profile contact fields: phone (visible to the member) and an
-- admin-only internal note (HR-style observation, not shown to the member).

alter table public.users
  add column phone text,
  add column internal_note text;
