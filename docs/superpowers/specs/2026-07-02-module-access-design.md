# Design — Module Access System (Sub-project A)

**Date:** 2026-07-02
**Status:** Approved (design) — pending spec review before planning
**Part of:** Pool + Payroll initiative. Decomposed into **A → B → C**:
- **A — Module access system** (this doc): `user_modules`, `can()` extension, dynamic sidebar, module-assignment drawer.
- **B — Pool** (calendar, sessions, participants, trainer settings). Depends on A.
- **C — Payroll** (snapshots, generation). Depends on B.

This spec covers **A only**. B and C get their own spec → plan → implementation cycles.

---

## Purpose

Educators see nothing by default beyond Settings and their own group(s)/children. Pool and Payroll (and any future opt-in module) are **off by default** and granted explicitly per educator, **per kindergarten**, by an Admin/Super Admin. This sub-project builds the general grant mechanism plus the plumbing that makes authorization and navigation react to it. It ships **no** Pool/Payroll feature code — only the access layer they will both consume.

## Scope

**In scope**
- `user_modules` table + migration + RLS + regenerated types.
- `can()` / `usePermissions` extended with `view` action, `pool`/`payroll` resources, and a `payrollScope()` helper.
- Module grants cached in `auth.store` (synchronous "claims" cache).
- Dynamic sidebar entries for Bazin (`/pool`) and Salarii (`/payroll`).
- `ModuleAssignmentPanel` opened as a **drawer/modal from the staff list** (row action), Admin/Super Admin only.
- `staff.service` extended with `listUserModules` / `grantModule` / `revokeModule`.
- i18n keys (RO + EN). Vitest for `can()`/`payrollScope()` and grant/revoke.

**Out of scope (deferred to B/C)**
- Any `pool_*` / `payroll_*` tables, calendar, sessions, participants, trainer settings, snapshots.
- The `/pool` and `/payroll` routes may exist as lightweight "coming soon" stubs so the sidebar links resolve; real screens come in B/C.
- A dedicated staff detail page. The assignment UI is a drawer from the list (decision below); a detail page can come later independently.

---

## Data model

### Table: `user_modules`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `user_id` | uuid → users | grantee |
| `kindergarten_id` | uuid → kindergartens | grant is **per kindergarten**, not global |
| `module_key` | text | check in (`pool`, `payroll_own`, `payroll_all`) |
| `granted_by` | uuid → users | **required**; who granted it |
| `granted_at` | timestamptz | default `now()` |
| `created_at`, `updated_at`, `created_by`, `updated_by` | standard audit columns | auto-update trigger |
| `deleted_at` | timestamptz null | soft delete |

**Constraint:** `UNIQUE (user_id, kindergarten_id, module_key) WHERE deleted_at IS NULL`.

**Semantics**
- No row = no access. A grant is the *presence* of a live row, not a boolean flag.
- `payroll_own` and `payroll_all` are **separate keys**, not one key with a scope column. Pool is binary; Payroll needs scope, so scope is encoded in the key.
- Admin / Super Admin bypass `user_modules` entirely — access is role-first, `user_modules` extends only EDUCATOR.
- General mechanism: any future opt-in module reuses this table with a new `module_key`.

### RLS

- **Super Admin:** bypass (role check), consistent with existing tables.
- **Admin:** full read/write on rows whose `kindergarten_id` is in their `user_kindergartens`, `deleted_at IS NULL`.
- **Educator:** may **read** their own rows (`user_id = auth.uid()`) so their sidebar resolves. **No insert/update/delete** — prevents self-escalation.
- `granted_by` must be set on insert (enforced by the write path; Admin/Super Admin only can write).

Indexes: `(user_id, kindergarten_id)` for the claims lookup; `(kindergarten_id)` for admin listing.

After migration: `supabase gen types typescript --local > src/core/supabase/types.ts`.

---

## Authorization

### Claims cache in `auth.store`

`can()` is and must stay **synchronous** — every existing call site relies on it. Module grants therefore live in the auth store as a cache, loaded alongside the user profile.

- New service: `listUserModuleGrants(client, userId): Result<ModuleGrant[]>` where `ModuleGrant = { kindergartenId: string; moduleKey: ModuleKey }`. One read returns **all** kindergartens' grants for the user.
- `auth.store` gains `moduleGrants: ModuleGrant[]`, populated right after the profile in **`login()`** and **`fetchCurrentUser()`**, cleared on `logout()`.
- Switching kindergarten does **not** refetch — the cache already holds every kindergarten's grants for this user.
- Rationale for rejecting alternatives: an async `can()` breaks every call site; a separate async `useModuleAccess()` scatters authorization outside the single `can()` helper, which CLAUDE.md forbids.

### `can()` / `usePermissions` extension

- `PermissionAction` += `'view'`.
- `PermissionResource` += `'pool' | 'payroll'`.
- `can('view', 'pool', kgId)`:
  - Super Admin / Admin → `true` (scoped to their kindergartens by RLS/tenant).
  - Educator → a live `pool` grant exists for that `kgId` in the cache.
- Payroll has own/all scope, but `can()` returns boolean. Add a sibling helper:
  - `payrollScope(kgId): 'all' | 'own' | null`
    - Super Admin / Admin → `'all'`.
    - Educator with `payroll_all` grant → `'all'`; with `payroll_own` → `'own'`; else `null`.
  - `can('view', 'payroll', kgId)` ≡ `payrollScope(kgId) !== null`.
  - Sub-project C's payroll service consumes `payrollScope` to decide `trainer_id = auth.uid()` filtering. Own/all logic lives in one place, never in components.

---

## UI

### Dynamic sidebar (`layouts/admin.vue`)

Extend the existing `navItems` computed with two entries using the current `enabled` pattern:

- Bazin → `/pool`, `enabled: can('view', 'pool', currentKgId)`
- Salarii → `/payroll`, `enabled: can('view', 'payroll', currentKgId)`

`currentKgId = tenantStore.selectedKindergartenId`. When `'ALL'` (Admin/Super Admin only), both show — they bypass on role. The existing "enabled + coming-soon badge" rendering is untouched; a disabled entry renders exactly like today's coming-soon items.

### `ModuleAssignmentPanel` — drawer from the staff list

**Decision:** the panel opens as a **drawer/modal from a staff-list row action** ("Acces module"), not a staff detail page. The detail page the original prompt referenced does not exist; building one is scope creep beyond module access and can happen independently later.

- Lives in `src/modules/staff/components/ModuleAssignmentPanel.vue`.
- Visible/openable only when the actor is Admin/Super Admin (gate via `can`).
- For the selected educator, render one section **per kindergarten the educator is assigned to** (multiple sections if multiple kindergartens).
- Each section: three checkboxes — **Pool · Payroll (doar al lui) · Payroll (toate)** mapping to `pool` / `payroll_own` / `payroll_all`.
- Save = upsert diff against current grants: check a box → `grantModule`; uncheck → `revokeModule` (soft delete). Idempotent.
- Loading / error / empty (educator assigned to no kindergarten) states handled.

### `staff.service` extension (existing function+client+Result pattern)

- `listUserModules(client, userId, kindergartenId): Result<UserModuleRow[]>`
- `grantModule(client, userId, kindergartenId, moduleKey, actorId): Result<UserModuleRow>` — insert, or resurrect a soft-deleted row.
- `revokeModule(client, userId, kindergartenId, moduleKey): Result<null>` — soft delete (`deleted_at = now()`).

Data flow stays: component → composable → store → service → Supabase. All fetches via `useAsyncData`/`useLazyAsyncData`.

---

## i18n (RO + EN)

- `nav.pool` ("Bazin"), `nav.payroll` ("Salarii").
- `staff.moduleAccess` ("Acces module"), `staff.grantAccess`, plus labels for the three checkboxes and the drawer title.
No hardcoded user-facing strings.

---

## Testing (Vitest)

- `can('view', 'pool'/'payroll', kg)` and `payrollScope(kg)` across role × grant combinations:
  - educator, no grant → `false` / `null`;
  - educator with `pool` on kg A only → `true` on A, `false` on B;
  - educator with `payroll_own` → scope `'own'`; with `payroll_all` → `'all'`;
  - admin / super_admin → bypass (`true` / `'all'`) regardless of cache.
- `grantModule` idempotent (re-grant of a live row is a no-op / no duplicate); `revokeModule` sets `deleted_at`; re-grant after revoke resurrects.

## Definition of done (A)

- [ ] Migration created + types regenerated (`user_modules`).
- [ ] Educator with no rows → Pool/Payroll appear disabled (coming-soon style) in the sidebar, not hidden.
- [ ] `can('view','pool')` / `can('view','payroll')` check the cache for EDUCATOR, bypass for Admin/Super Admin.
- [ ] `payroll_own` vs `payroll_all` are distinct keys; `payrollScope()` returns the right scope.
- [ ] Sidebar entries appear/disappear per grant, per selected kindergarten — not hardcoded per role.
- [ ] `ModuleAssignmentPanel` works as a drawer from the staff list; only Admin/Super Admin can open/edit.
- [ ] Grants are per kindergarten (educator with 2 kindergartens can have Pool at only one).
- [ ] Claims cache populated in `login()` + `fetchCurrentUser()`, cleared on `logout()`.
- [ ] All strings via i18n (RO + EN); all queries scoped `kindergarten_id` + `deleted_at IS NULL`.
- [ ] Vitest green for `can()`/`payrollScope()` and grant/revoke.
- [ ] Loading + error + empty states on the drawer.
