# Startica — Audit v2 (re-audit after security fixes)

**Date:** 2026-06-26
**Context:** Follow-up to `Startica_Audit_2026-06-26.md` after commit `3282e02 fix(security): close C1 privilege escalation + fix service_role grants + e2e tests` and migration `20260626132001_security_fixes.sql`.

---

## Verified fixed — good work

- **C1 (self privilege escalation)** — closed correctly. `prevent_self_privilege_escalation()` is a `BEFORE UPDATE` trigger that blocks `role`/`status`/`deleted_at` changes when `new.id = auth.uid()`, and deliberately exempts service-role calls (`auth.uid() IS NULL`). This is the robust fix, not a band-aid.
- **M2 (soft-deleted rows mutable)** — all four update policies (`users`, `groups`, `children`, `parents`) recreated with `deleted_at IS NULL` in the USING clause. Correct.
- **service_role grants** — `grant ... on all tables ... to service_role` added; the invite route's "permission denied" risk is gone.
- **Staff e2e coverage** — `tests/e2e/staff.spec.ts` added.
- **Route relocation** — the invite handler moved from `server/` to `src/server/`. I verified this is harmless: `.nuxt/types/nitro-routes.d.ts` still maps `/api/staff/invite`, so Nuxt 3.21 scans `src/server` with `srcDir: 'src/'`. No regression.

The migration is clean and well-commented. Nothing to redo there.

---

## Critical — the privilege-escalation fix is not complete

### CR1 — An admin can still mint a `super_admin` (escalation by proxy)
C1 closed the *self* path. The *other-row* path is still open, and it's the more dangerous one because it crosses the tenant boundary into full system control.

The chain:
1. `updateStaffSchema.role` permits `'super_admin'` (`z.enum(['super_admin', 'admin', 'educator'])`).
2. Staff updates go **client → Supabase directly** via `updateStaffProfile` (the browser client, governed only by RLS) — there is no server route to add a guard to, unlike invite.
3. RLS `users_update_admin` lets an admin update any co-worker sharing one of their kindergartens, **with no restriction on the new role value**.
4. The `prevent_self_privilege_escalation` trigger only fires for `new.id = auth.uid()`, so it does **not** cover updating *another* row.
5. The only thing currently stopping this is the UI: `StaffListPage.vue` hides the role `<select>` unless `user.role === 'super_admin'` (lines 82, 254). **That is a client-side guard.** An admin can bypass it with a direct PostgREST `PATCH` (or a one-line console call to the service).

Concrete exploit: an admin invites an educator at an email they control, then `PATCH /users?id=eq.<puppet>` setting `role=super_admin`. RLS allows it, the trigger doesn't fire, and they now own a super-admin account.

**Fix (server/DB — never rely on the hidden field):**
- Add to the trigger logic (or a sibling trigger on `users`): if `new.role = 'super_admin'` and `old.role <> 'super_admin'`, raise unless `is_super_admin()`. Optionally also block non-super-admins from *removing* a super_admin's role. This is the real enforcement point, since RLS WITH CHECK can't compare against OLD.
- Tighten `updateStaffSchema.role` to `['admin', 'educator']` for the client path, and route any `super_admin` grant through a super-admin-only server endpoint (mirroring how invite restricts roles).

This is the same severity class as C1 — treat it as part of the same fix, not a separate nicety.

---

## High — carried over from v1, still open

These were flagged in the first audit and are unchanged. Restating tersely so the backlog stays honest:

- **H1 — asyncData convention still violated.** `KindergartensListPage`, `StaffListPage`, `AcceptInvitePage` all still fetch via `onMounted(() => fetchAll())` into Pinia. No SSR data, no dedup, hand-rolled pending/error. Worth fixing before children/groups copy the pattern a third and fourth time.
- **H2 — no lint.** Still no eslint dependency and no `lint` script, despite CLAUDE.md commanding both.
- **H3 — no CI.** No `.github/`. Tests exist but nothing runs them on push.
- **H4 — email diverges from spec.** `core/email/` still empty; invites still send via Supabase default `inviteUserByEmail`, not the Brevo/vue-email pipe the architecture mandates.
- **C2 — audit logging still absent.** `audit_logs` confirmed to have zero callers across `src/` and `src/server/`. Still dead infrastructure.

---

## Medium

- **M1 — audit columns not DB-enforced.** `created_by`/`updated_by` still depend on the service passing `actorId`; no trigger stamps them. (Now that you have a working trigger pattern from the security migration, this is cheap to add.)
- **M3 — tenant invariant still service-only.** Nothing enforces `child.kindergarten_id == group.kindergarten_id` at the DB; RLS trusts it.
- **M5 — invite route still untested.** `src/server/api/staff/invite.post.ts` carries the real authz (and is now the one place that *correctly* restricts invited roles) but has no test covering the "admin can't invite into a kindergarten they're not in" / "role can't be super_admin" branches.
- **M6 (new) — authorization placed in the UI.** CR1's root cause generalized: the role-edit gate lives in `StaffListPage.vue`. Audit the codebase for any other place where a permission decision exists only in a component; every one needs a server/RLS/trigger backstop. `usePermissions.can()` is fine for *showing/hiding*, never for *enforcing*.

---

## Low

- **L1 (new) — mixed line endings.** `20260626132001_security_fixes.sql` and the rewritten grant migration are now CRLF, producing whole-file diffs. Add a `.gitattributes` (`* text=auto eol=lf`) and `.editorconfig` so EOL doesn't churn diffs.
- **L2 — large uncommitted working tree.** ~30 modified files still sitting unstaged (auth module, middleware, config). Commit or stash so the branch state is legible and the next audit diffs cleanly.

---

## Suggested order

1. **CR1** — finish the privilege-escalation fix with a trigger + schema tightening. One migration, same shape as the one you just wrote.
2. **M5** — add the invite-route test while you're in the authz code; it also guards CR1's invite branch.
3. **H2 + H3** — eslint + CI, so CR1's fix and everything after is regression-protected.
4. **H1** — asyncData refactor before more pages are built on `onMounted`.
5. **C2 + M1** — audit logging and enforced stamps together (triggers migration).
6. **H4**, then the remaining Medium/Low as you touch each area.

**Bottom line:** the fixes landed are correct and well-built, but the privilege-escalation surface was only half-closed — the admin→super_admin path through staff *update* is still live and server-unguarded. That's the one thing to fix before anything else.
