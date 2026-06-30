-- Revoke the authenticated INSERT grant on audit_logs.
-- All legitimate audit writes go through service-role (write_audit_log trigger
-- and the explicit adminClient inserts in invite.post.ts). Authenticated users
-- have no business writing audit rows directly.
revoke insert on public.audit_logs from authenticated;

-- Drop the now-unused insert policy (no grant → policy is unreachable, but
-- drop it for clarity).
drop policy if exists audit_logs_insert on public.audit_logs;
