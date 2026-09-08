# Startica — Codebase Audit

**Date:** 2026-06-26
**Scope:** V1 admin panel as it stands on the working branch (auth, kindergartens, staff built; children/groups/dashboard/settings scaffolded only).
**Method:** Read the real source — migrations + RLS, services, stores, middleware, the invite server route, config, seed, tests. Findings below are grounded in code, not the spec.

The foundation is genuinely strong: clean modular-monolith layering, services as the only DB caller, TDD discipline (services/stores/schemas/middleware all have tests), thoughtful RLS with `security definer` helpers to avoid recursion, and the cross-cutting rules (soft delete, audit columns, tenant scoping) modeled correctly in the schema. The issues below are the gap between that design and what's actually wired.

---

## Critical

### C1 — A logged-in user can promote themselves to `super_admin`
This is the headline. `grant update on public.users to authenticated` plus the RLS policy:

```sql
create policy users_update_self on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());
```

RLS filters *rows*, not *columns*. Nothing stops an authenticated user from issuing a direct PostgREST `PATCH /users?id=eq.<self>` setting `role = 'super_admin'` (or `status`, or un-setting `deleted_at`). The whole authorization model collapses from any browser session.

**Fix:** restrict which columns self-update can touch. Options, in order of robustness:
- A `BEFORE UPDATE` trigger on `users`: if `auth.uid() = id` and the row's `role`/`status`/`deleted_at` changed, raise unless `is_super_admin()`/admin. This is the reliable one.
- Or column-level `GRANT update (full_name, avatar_url) on public.users to authenticated` and revoke table-wide update — Postgres then rejects writes to other columns.
- Keep all role/status mutation behind the service-role server route (where the staff flow already lives) and drop the broad self-update grant.

### C2 — The audit trail described everywhere is not actually written
`audit_logs` has a table, indexes, RLS, and an INSERT grant — but **zero callers**. No service writes a row. For a product handling children's medical data in the EU, "who viewed/edited this child" is a GDPR-relevant expectation, and the Definition of Done implies it. Right now it's dead infrastructure.

**Fix:** write audit rows from the service layer (or, better, DB triggers on insert/update of `children`/`groups`/`users` so it can't be forgotten). Decide deliberately whether reads are audited too.

---

## High

### H1 — Data-fetching convention is violated in every page
CLAUDE.md is emphatic: *"ALL data fetching goes through `useAsyncData`/`useLazyAsyncData`... No raw `$fetch`/`fetch` in components."* Reality — `KindergartensListPage` and `StaffListPage` both do `onMounted(() => fetchAll())` straight into the Pinia store. Consequences: no SSR data (everything fetches client-side after mount, so first paint is empty), no request dedup/caching, and you've rebuilt pending/error handling by hand in each store instead of getting it from asyncData.

**Fix:** wrap the service calls in `useAsyncData` keyed per resource+tenant, hydrate the store from the result. This is also the right seam to add the missing empty/error states (the DoD checklist item that's currently only half-met — stores capture `error` but pages don't consistently surface it).

### H2 — `npm run lint` is documented but doesn't exist
CLAUDE.md's command list and Definition of Done reference `npm run lint` / eslint. There is no `lint` script and no eslint dependency in `package.json`. Nothing is enforcing style or catching `no-floating-promises`, unused vars, etc.

**Fix:** add `@nuxt/eslint` (flat config, integrates with the Nuxt module), wire `npm run lint`, and make it match the docs — or remove the claim from the docs. Same for the missing `db reset`/types regen being a manual ritual with nothing checking it ran.

### H3 — No CI pipeline
You have real tests (Vitest + Playwright) — but nothing runs them on push. Combined with H2, regressions can land silently. I also couldn't run the suite in a clean Linux environment: Vitest 4's `rolldown` native binding wasn't resolvable from the committed `node_modules`. That's a portability smell worth confirming before you stand up CI on Linux runners.

**Fix:** a GitHub Actions workflow running `typecheck → lint → test → test:e2e` against a Supabase service container. Pin the toolchain and verify a clean `npm ci` install works on Linux.

### H4 — Email architecture diverges from the spec
CLAUDE.md specifies a unified Brevo SMTP pipe with vue-email bilingual templates behind `core/email/`. `core/email/` is empty (`.gitkeep`), and the *already-built* invite route sends via Supabase's default `inviteUserByEmail`. So invitation mail is going out today through a path the architecture says it shouldn't, with no RO/EN templating and no GDPR-residency guarantee.

**Fix:** either build the `core/email/` abstraction now (since invites already send real mail) or explicitly mark the Brevo pipe as deferred and note that V1 invites use Supabase default SMTP. Don't leave the doc and the code disagreeing.

---

## Medium

### M1 — Audit columns aren't enforced at the DB
`created_by`/`updated_by` are populated only when a service remembers to pass `actorId`. There's no default or trigger, so any future direct insert (or a forgotten arg) leaves them null, and a client-supplied `updated_by` is trustable only as far as the service is. Consider a trigger that stamps `updated_by = auth.uid()` so it can't drift.

### M2 — Update policies don't re-assert `deleted_at IS NULL`
`children_update`/`groups_update`/`parents_update` USING clauses don't exclude already-soft-deleted rows, so a soft-deleted record can still be mutated (including resurrected). Add `and deleted_at is null` to the USING clauses, or guard in the soft-delete service path.

### M3 — The tenant-invariant on `children.kindergarten_id` is service-only
The schema comments acknowledge `kindergarten_id` is denormalized and "the service guarantees consistency." Nothing in the DB enforces that `child.kindergarten_id == group.kindergarten_id`, and RLS keys off it. A bug in the service silently grants cross-tenant visibility. A composite FK `(group_id, kindergarten_id)` referencing a matching unique key on `groups`, or a trigger, would make the invariant structural rather than aspirational.

### M4 — Bleeding-edge major versions across the board
Tailwind 4, Nuxt UI 3, Zod 4, Vitest 4, Pinia 3, `@types/node` 26. Each is fine individually; together they maximize the surface for breaking-change churn and thin community answers when something breaks (see H3's native-binding issue). Worth a conscious "we accept the churn" decision, and pinning exact versions rather than `^` ranges for the riskiest ones.

### M5 — The security-critical route has no test
`server/api/staff/invite.post.ts` carries the real authz logic (role check, admin-scoped-to-own-kindergarten check, idempotent membership upsert) and has no unit/integration test, while lower-risk services are fully TDD'd. This is the one endpoint most worth a test — especially the "admin can't invite into a kindergarten they don't belong to" branch.

---

## Low / polish

- **L1** — `listStaff` does two round-trips (memberships, then users). Fine at current scale; a view or RPC removes the N+1 if staff lists grow.
- **L2** — `requestPasswordReset` builds the redirect from `window.location.origin` inside a store action; guard for SSR or move to a composable that's client-only by contract.
- **L3** — `national_id` validation (`validateNationalId` branching on CNP/IDNP), and the derived `age`/`zodiac_sign` utils are described in CLAUDE.md but `shared/utils/` is empty — expected, since the children module is unbuilt, but flagging so it's not forgotten when that module lands.
- **L4** — `audit.spec.ts`-style coverage aside, there are no e2e tests for the role-gating redirects (`role-redirect` has unit tests, but no Playwright check that an educator hitting `/kindergartens` is bounced).
- **L5** — Several modified files are uncommitted on the working tree (middleware, config, plans). Worth committing or stashing so the branch state is legible.

---

## Suggested order of work

1. **C1** (privilege escalation) — before anything else; it's a one-migration fix.
2. **H2 + H3** (lint + CI) — cheap, and they stop the next regressions.
3. **H1** (asyncData) — refactor the two existing pages now so children/groups/staff are built on the right pattern, not retrofitted later.
4. **C2 + M1** (audit logging + enforced stamps) — do them together as a triggers migration.
5. **H4** (email) — decide build-now vs. defer, and reconcile the docs.
6. The Medium/Low items as you touch the relevant areas.
