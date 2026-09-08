# PR #5 Security & Quality Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 9 Important findings from the 4-agent PR #5 review (security hardening, audit integrity, RLS test coverage, architecture layering, off-palette color).

**Architecture:** Startica is a Nuxt 3 / Supabase multi-tenant SaaS. All DB changes go in migrations under `supabase/migrations/`. Server routes live in `src/server/api/`. Shared composables in `src/shared/composables/`, auth-module composables in `src/modules/auth/composables/`.

**Tech Stack:** Nuxt 3, TypeScript strict, Supabase (Postgres + RLS), Vitest (unit), Playwright (e2e), pgTAP (DB tests via `supabase test db`), Tailwind CSS v4 + Nuxt UI.

## Global Constraints

- Every migration is a new `.sql` file under `supabase/migrations/` with a monotonically increasing timestamp prefix; never edit existing migrations.
- All user-facing strings go through i18n keys — no hardcoded strings in `.vue` files.
- Soft delete only — never hard-DELETE business rows.
- Design token palette: only `teal-*`, `slate-*`, `brand-yellow`, `brand-gold`, `brand-peach`, `brand-sage`, `brand-cream`, `success`, `warning`, `error`, `info` are valid color classes. `amber` is NOT in the palette. See `src/assets/css/main.css` @theme block.
- TypeScript strict mode — no `any` escapes unless unavoidable, no unused variables.
- Tests must pass before committing.
- After any DB migration: run `supabase gen types typescript --local > src/core/supabase/types.ts` (or note it in the commit message if supabase stack is not running).

---

### Task 1: Harden invite route (S-I1, DB-2, S-M6)

**Files:**
- Modify: `src/server/api/staff/invite.post.ts`
- Modify: `src/server/api/staff/invite.post.test.ts`

**Problem summary:**
- **S-I1:** The admin educator-only check (line 48) only validates the *requested* role. For existing users the route reuses `existing.id` without checking `existing.role`. An admin can silently re-add an existing admin into their kindergarten, bypassing the educator-only rule.
- **DB-2:** The invite route writes one explicit audit row for `user_kindergartens` (line 111). But the `users` INSERT for new user profile creation (line 83) is never audited — the `write_audit_log` trigger returns early for service-role context (`auth.uid() IS NULL`).
- **S-M6:** Email is not lowercased before the `existing` lookup (line 55). A case-variant (`BOB@x.com`) would miss the super_admin guard at line 59 and fall through to `inviteUserByEmail`, potentially sending an invite to a variant of a super_admin email.

**Changes to `invite.post.ts`:**

- [ ] **Step 1: Normalize email to lowercase immediately after parsing body**
  ```ts
  // After: const { email, fullName, role, kindergartenId } = parsed.data
  const normalizedEmail = email.toLowerCase()
  // Replace ALL subsequent uses of `email` with `normalizedEmail`
  // (inviteUserByEmail call, from('users').insert, from('users').select(...).eq('email', ...))
  ```

- [ ] **Step 2: Add existing-user role guard for admin callers**

  After the existing-user lookup (currently at line 52-57), add a check:
  ```ts
  // S-I1: admin may only re-add users whose current role is educator.
  // (super_admin callers are unrestricted; the super_admin-target guard above handles that edge.)
  if (existing && callerProfile.role === 'admin' && existing.role !== 'educator') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  ```
  Place this AFTER the `existing?.role === 'super_admin'` guard (line 59) and BEFORE the `if (existing)` branch at line 65.

- [ ] **Step 3: Add audit row for new user profile creation (DB-2)**

  In the new-user branch, after the successful `users` INSERT (currently lines 83-95), add an explicit audit log for the user creation:
  ```ts
  // Audit: log the new user account creation explicitly.
  // write_audit_log trigger fires only when auth.uid() IS NOT NULL;
  // service-role context means auth.uid() IS NULL, so we log manually.
  const { error: userAuditError } = await adminClient.from('audit_logs').insert({
    user_id: caller.id,
    kindergarten_id: kindergartenId,
    action: 'create',
    entity: 'users',
    entity_id: userId,
  })
  if (userAuditError) {
    console.error('[invite] user audit log failed:', userAuditError.message)
  }
  ```
  Place this immediately after the `profileError` check and before the membership upsert.

- [ ] **Step 4: Run existing Vitest suite to confirm nothing broke**
  ```
  npx vitest run src/server/api/staff/invite.post.test.ts
  ```
  Expected: all existing tests pass.

- [ ] **Step 5: Add new tests for S-I1 and S-M6 to `invite.post.test.ts`**

  Add the following two tests to the existing `describe` block:

  ```ts
  it('returns 403 when admin tries to re-add an existing admin user', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY) // role: 'educator' in VALID_BODY
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'admin', status: 'active' }, error: null }))        // caller profile
      .mockReturnValueOnce(makeQuery({ data: { user_id: CALLER_ID }, error: null }))                     // membership → member
      // existing.role is 'admin' (not educator)
      .mockReturnValueOnce(makeQuery({ data: { id: 'target-admin', role: 'admin' }, error: null }))

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 403 })
    expect(mockAdminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('normalizes email to lowercase before existing-user lookup', async () => {
    mockReadBody.mockResolvedValue({ ...VALID_BODY, email: 'NEW@EXAMPLE.COM' })
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    const NEW_USER_ID = 'aaaaaaaa-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))  // no existing user
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))  // profile insert
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))  // user audit log
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))  // membership upsert
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))  // audit log

    mockAdminClient.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    const result = await ((handler as unknown) as RouteHandler)({})
    expect(result).toEqual({ success: true })
    // The invite should have been sent to the lowercased email
    expect(mockAdminClient.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'new@example.com',
      expect.any(Object),
    )
  })
  ```

  Note: the existing test `'invites new user and inserts their profile when called by super_admin'` had 5 `mockReturnValueOnce` entries. After adding the user audit log insert, it needs a 4th DB call in the new-user branch. Update that test to add one more `makeQuery({ data: null, error: null })` mock between profile insert and membership upsert.

- [ ] **Step 6: Run test suite again to confirm new tests pass**
  ```
  npx vitest run src/server/api/staff/invite.post.test.ts
  ```
  Expected: all tests pass (count increases by 2).

- [ ] **Step 7: Commit**
  ```bash
  git add src/server/api/staff/invite.post.ts src/server/api/staff/invite.post.test.ts
  git commit -m "fix(security): harden invite route — existing-user role guard, email normalization, user creation audit log (S-I1, S-M6, DB-2)"
  ```

---

### Task 2: Remove audit_logs public write access + disable public signup (S-I2, S-I3)

**Files:**
- Create: `supabase/migrations/20260629200000_audit_logs_lockdown.sql`
- Modify: `supabase/config.toml`

**Problem summary:**
- **S-I2:** `grant select, insert on public.audit_logs to authenticated` (`grant_table_privileges.sql:17`) + `create policy audit_logs_insert ... with check (user_id = auth.uid())` (`initial_schema.sql:569`) allow any authenticated user (educator) to insert rows with arbitrary `kindergarten_id`, poisoning the audit trail. The only legitimate write paths are: (a) the `write_audit_log` SECURITY DEFINER trigger (service-role context), and (b) the explicit `adminClient.from('audit_logs').insert(...)` in `invite.post.ts` — both use service-role, which bypasses RLS entirely. The `authenticated` INSERT grant is unnecessary.
- **S-I3:** `supabase/config.toml` has `enable_signup = true` in two places (line 176 and 221). The Startica model is invite-only; public signup is a footgun.

**Changes:**

- [ ] **Step 1: Create the lockdown migration**

  Create `supabase/migrations/20260629200000_audit_logs_lockdown.sql`:
  ```sql
  -- Revoke the authenticated INSERT grant on audit_logs.
  -- All legitimate audit writes go through service-role (write_audit_log trigger
  -- and the explicit adminClient inserts in invite.post.ts). Authenticated users
  -- have no business writing audit rows directly.
  revoke insert on public.audit_logs from authenticated;
  
  -- Drop the now-unused insert policy (no grant → policy is unreachable, but
  -- drop it for clarity).
  drop policy if exists audit_logs_insert on public.audit_logs;
  ```

- [ ] **Step 2: Disable public signup in config.toml**

  In `supabase/config.toml`, change both occurrences:
  - Line 176: `enable_signup = false`  (under `[auth]`)
  - Line 221: `enable_signup = false`  (under `[auth.email]`)

- [ ] **Step 3: Commit**
  ```bash
  git add supabase/migrations/20260629200000_audit_logs_lockdown.sql supabase/config.toml
  git commit -m "fix(security): revoke audit_logs INSERT from authenticated, disable public signup (S-I2, S-I3)"
  ```

---

### Task 3: Fix DB test gaps (DB-1, DB-3)

**Files:**
- Modify: `supabase/tests/rls_isolation.test.sql`
- Modify: `supabase/tests/security_triggers.test.sql`

**Problem summary:**
- **DB-1:** `rls_isolation.test.sql` has only 4 tests covering `users` and `kindergartens`. No RLS tests for `children` (GDPR-sensitive table). Need at least one cross-tenant isolation test for children.
- **DB-3:** `security_triggers.test.sql` never calls `SET LOCAL ROLE authenticated` — it sets `request.jwt.claims` but runs as the `postgres` superuser, so RLS policies are never evaluated. The trigger tests are valid (triggers fire regardless of role), but comments claiming "USING clause permits the row" are misleading because RLS is bypassed entirely. Tests 9 and 10 are also numbered out of execution order (they appear in the file before Tests 7 and 8). Fix: add `SET LOCAL ROLE authenticated` where needed, fix misleading comments, renumber sequentially.

**Changes to `rls_isolation.test.sql`:**

- [ ] **Step 1: Bump plan count and add children cross-tenant test**

  The file currently has `SELECT plan(4)`. Change to `SELECT plan(6)` and add 2 new tests at the end, before `RESET ROLE`:

  First, in the Setup block (after the existing INSERTs at the top), add a child belonging to KG-B only:
  ```sql
  -- Child belonging only to KG-B (for cross-tenant isolation test)
  INSERT INTO public.children (
    id, full_name, birth_date, kindergarten_id, status, created_by
  ) VALUES (
    'cccccccc-1111-4111-8111-111111111111',
    'Copil KG-B',
    '2020-03-15',
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    'enrolled',
    '11111111-1111-1111-1111-111111111111'
  );
  ```

  Then add two new tests after Test 4 (before `RESET ROLE`):
  ```sql
  -- ── Test 5: admin (KG-A only) cannot read a child from KG-B ─────────────────
  SELECT is(
    (SELECT count(*) FROM public.children WHERE id = 'cccccccc-1111-4111-8111-111111111111'),
    0::bigint,
    'admin cannot read children belonging only to a different kindergarten'
  );

  -- ── Test 6 (positive): admin CAN read children from their own kindergarten ───
  -- Requires at least one child to exist in KG-A from seed data.
  -- Seed inserts a child in KG-A; verify RLS lets the admin see it.
  SELECT ok(
    (SELECT count(*) FROM public.children WHERE kindergarten_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') >= 0,
    'admin can query children in their own kindergarten (no permission error)'
  );
  ```

  Note: Test 6 uses `>= 0` rather than `= 1` because the seed may or may not have children in KG-A. The key assertion is that the query succeeds (no RLS violation) and returns only KG-A rows. If seed data has a known child UUID in KG-A, use a stronger assertion (`= 1` with `WHERE id = '<known-uuid>'`). Check `supabase/seed.sql` for the actual child UUID and use a precise assertion if available.

- [ ] **Step 2: Update the seed guard comment**

  Update the guard at the top of the file to mention the children dependency:
  ```sql
  -- Relies on seed users (populated by `supabase db reset`):
  --   22222222-2222-2222-2222-222222222222  admin  (assigned to KG-A only)
  --   aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa  Grădinița Zâna Florilor (KG-A)
  -- KG-B and its child are created inline and rolled back.
  ```

- [ ] **Step 3: Check seed.sql for a known child UUID in KG-A; update Test 6 if found**

  Read `supabase/seed.sql` and look for a `children` INSERT with `kindergarten_id = 'aaaaaaaa-...'`. If found, use that child's UUID in Test 6 for a precise equality assertion.

**Changes to `security_triggers.test.sql`:**

- [ ] **Step 4: Renumber tests sequentially**

  The current execution order in the file is: 1,2,3,4,5,6,9,10,7,8 (Tests 9 and 10 appear in the file before Tests 7 and 8). Move/renumber so execution order matches the labels:
  - What is currently labeled Test 9 (admin cannot promote another user — lines ~86-96) → rename to Test 7
  - What is currently labeled Test 10 (admin cannot change role to non-super_admin — lines ~98-107) → rename to Test 8
  - What is currently labeled Test 7 (audit_logs row written on UPDATE — lines ~114-128) → rename to Test 9
  - What is currently labeled Test 8 (audit_logs row written on INSERT — lines ~130-169) → rename to Test 10

  Keep the `SELECT plan(10)` count unchanged.

- [ ] **Step 5: Add SET LOCAL ROLE authenticated before trigger tests and fix comments**

  The file currently sets `request.jwt.claims` at line 45 and again at line 90. But it never calls `SET LOCAL ROLE authenticated`, so the postgres superuser bypasses RLS. The trigger tests are still valid (triggers fire regardless), but the comments are misleading.

  Add the role switch immediately after each `SET LOCAL "request.jwt.claims"`:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claims" = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
  ```

  And before switching back to the super_admin context for audit tests (currently around line 112):
  ```sql
  -- Reset to superuser so audit inserts aren't blocked by RLS.
  RESET ROLE;
  SET LOCAL "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
  ```

  Fix the comment on (new) Test 7 (formerly Test 9):
  - Old: `'the USING clause permits the row — only the proxy-escalation guard blocks it'`
  - New: `'proxy-escalation trigger blocks the attempt before RLS UPDATE USING is evaluated'`

  This is accurate: with `SET LOCAL ROLE authenticated`, RLS is now in play, but the trigger fires first (alphabetical trigger name ordering means `trg_prevent_self_privilege_escalation` fires before any RLS check resolves for UPDATE).

- [ ] **Step 6: Commit**
  ```bash
  git add supabase/tests/rls_isolation.test.sql supabase/tests/security_triggers.test.sql
  git commit -m "test(db): add children cross-tenant RLS test, fix security_triggers ROLE bypass and test numbering (DB-1, DB-3)"
  ```

---

### Task 4: Architecture + frontend cleanup (A-1, A-2, F-1)

**Files:**
- Create: `src/modules/auth/composables/usePermissions.ts`
- Delete: `src/shared/composables/usePermissions.ts`
- Modify: `src/shared/composables/usePermissions.test.ts` (update import path)
- Modify: `src/modules/dashboard/services/dashboard.service.ts` (A-2)
- Modify: `src/modules/dashboard/pages/DashboardPage.vue` (F-1)

**Problem summary:**
- **A-1:** `src/shared/composables/usePermissions.ts` imports `useAuthStore` from `~/modules/auth/stores/auth.store`. Per CLAUDE.md rule: `shared/` must have zero business logic and must not import from modules. Fix: move the file to `src/modules/auth/composables/usePermissions.ts`. This is safe because `modules/auth/composables` is already in `nuxt.config.ts` `imports.dirs`, so all components keep their auto-import (no call site changes needed). Only the explicit import in the test file needs updating.
- **A-2:** `dashboard.service.ts:27-40` re-implements the same staff filter criteria as `staff.service.ts`: `deleted_at IS NULL`, `status = 'active'`, `role != 'super_admin'`, joined via `user_kindergartens!inner`. If "who counts as staff" changes (e.g., a new role added), it must be updated in two places. Fix: extract the shared criteria into a utility constant in `shared/utils/` that both services import.
- **F-1:** `DashboardPage.vue:46-47` uses `bg-amber-50` and `text-amber-500` for the Active Groups card icon. `amber` is NOT in the design palette (see `main.css` @theme). Fix: replace with on-palette colors. Use `bg-brand-sage` (a muted blue-green: `#AFC1BE`) and `text-teal-600` — this is visually distinct from the children card's `bg-teal-50`/`text-teal-600`.

**Changes:**

- [ ] **Step 1: Move usePermissions to auth module**

  Create `src/modules/auth/composables/usePermissions.ts` with the exact content of `src/shared/composables/usePermissions.ts` (no changes to logic, only file location changes):
  ```ts
  import { useAuthStore } from '~/modules/auth/stores/auth.store'

  export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'assign-role'
  export type PermissionResource = 'kindergarten' | 'staff' | 'children' | 'groups' | 'settings'

  export function usePermissions() {
    const authStore = useAuthStore()

    function can(action: PermissionAction, resource: PermissionResource, _target?: unknown): boolean {
      const role = authStore.user?.role
      if (!role) return false

      if (resource === 'kindergarten') {
        if (action === 'delete') return false
        return role === 'super_admin'
      }

      if (resource === 'staff') {
        if (action === 'assign-role') return role === 'super_admin'
        return role === 'super_admin' || role === 'admin'
      }

      if (resource === 'children') {
        if (action === 'read') return true
        return role === 'super_admin' || role === 'admin'
      }

      if (resource === 'groups') {
        if (action === 'read') return true
        return role === 'super_admin' || role === 'admin'
      }

      if (resource === 'settings') {
        return true
      }

      return false
    }

    return { can }
  }
  ```

  Delete `src/shared/composables/usePermissions.ts`.

- [ ] **Step 2: Update the test import**

  In `src/shared/composables/usePermissions.test.ts`, change line 4:
  ```ts
  // Before:
  import { usePermissions } from './usePermissions'
  // After:
  import { usePermissions } from '~/modules/auth/composables/usePermissions'
  ```

  Move the test file to `src/modules/auth/composables/usePermissions.test.ts` OR leave it in `shared/composables/` with the updated import. Either is acceptable; moving it alongside the implementation is cleaner. If you move it, update the git add accordingly.

- [ ] **Step 3: Run usePermissions tests to confirm nothing broke**
  ```
  npx vitest run src/modules/auth/composables/usePermissions.test.ts
  ```
  (or from the old path if left there)
  Expected: all 9 tests pass.

- [ ] **Step 4: Extract staff filter utility (A-2)**

  Create `src/shared/utils/staffFilters.ts`:
  ```ts
  import type { SupabaseClient } from '@supabase/supabase-js'
  import type { Database } from '~/core/supabase/types'

  type Client = SupabaseClient<Database>

  /**
   * Applies the canonical "staff member" filters to a users query:
   * active, not soft-deleted, not a super_admin.
   * Used by both staff.service.ts (list) and dashboard.service.ts (count).
   */
  export function applyStaffFilters(query: ReturnType<Client['from']>) {
    return query
      .is('deleted_at', null)
      .eq('status', 'active')
      .neq('role', 'super_admin')
  }
  ```

  Then update `src/modules/dashboard/services/dashboard.service.ts` to use it:
  ```ts
  import { applyStaffFilters } from '~/shared/utils/staffFilters'
  
  // In fetchStats(), replace the staffQuery block:
  const staffBaseQuery = client
    .from('users')
    .select(
      isAll ? 'id' : 'id, user_kindergartens!inner(kindergarten_id)',
      { count: 'exact', head: true },
    )

  if (!isAll) {
    staffBaseQuery.eq('user_kindergartens.kindergarten_id', kindergartenId)
  }

  const staffQuery = applyStaffFilters(staffBaseQuery)
  ```

  And update `src/modules/staff/services/staff.service.ts` to import the same utility where it filters staff (instead of chaining `.is('deleted_at', null).eq('status', 'active').neq('role', 'super_admin')` inline).

  Note: The TypeScript type signature for `applyStaffFilters` may need adjustment to work with the PostgREST query builder chain. If the generic type is hard to express cleanly, use a simpler approach: export the filter criteria as separate function calls applied at each call site with a shared comment `// canonical staff filters — keep in sync with applyStaffFilters`. Don't break type safety to satisfy DRY — if the util is awkward with TypeScript, document the criteria instead.

- [ ] **Step 5: Fix off-palette amber colors in DashboardPage.vue (F-1)**

  In `src/modules/dashboard/pages/DashboardPage.vue`, line 46-47:
  ```html
  <!-- Before (off-palette): -->
  <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
    <UIcon name="i-heroicons-user-group" class="h-5 w-5 text-amber-500" />
  </div>

  <!-- After (on-palette — brand-sage background, teal-600 icon): -->
  <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-sage/20">
    <UIcon name="i-heroicons-user-group" class="h-5 w-5 text-teal-600" />
  </div>
  ```

  `brand-sage` is `#AFC1BE` — a soft blue-green — distinct from the children card's `teal-50` background, keeping the stat cards visually differentiated.

- [ ] **Step 6: Run full unit test suite**
  ```
  npx vitest run
  ```
  Expected: all tests pass.

- [ ] **Step 7: Commit**
  ```bash
  git add src/modules/auth/composables/usePermissions.ts \
          src/shared/composables/usePermissions.ts \
          src/shared/composables/usePermissions.test.ts \
          src/shared/utils/staffFilters.ts \
          src/modules/dashboard/services/dashboard.service.ts \
          src/modules/staff/services/staff.service.ts \
          src/modules/dashboard/pages/DashboardPage.vue
  git commit -m "refactor: move usePermissions to auth module, extract staffFilters util, fix off-palette amber colors (A-1, A-2, F-1)"
  ```
