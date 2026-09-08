# PR #5 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all merge-blocking and high-priority findings from the 3-angle review of PR #5 (security H1-H3, perf H1, test H1-H2 + M1).

**Architecture:** DB migration extends the existing `prevent_self_privilege_escalation` trigger to block ALL role changes by non-super_admins (was: only super_admin grants/revokes). A server-side guard in the invite route enforces the same rule at the app layer. `listStaff` is refactored from two round-trips to a single embedded join. New pgTAP tests lock the cross-tenant isolation invariant at the DB layer. A new Playwright spec drives the Admin role through the UI.

**Tech Stack:** Nuxt 3 / TypeScript, Supabase (Postgres + RLS + pgTAP), Vitest, Playwright.

## Global Constraints

- All migration files: `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql` with `security definer set search_path = public` on all functions.
- After any migration: run `supabase db reset` then `supabase gen types typescript --local > src/core/supabase/types.ts`.
- No hardcoded user-facing strings — all through i18n.
- `can(action, resource)` is the only authorization call in components/composables.
- Services are the only DB callers; `invite.post.ts` is a server route (uses admin client directly — that is intentional and correct).
- Test commands: `npm run test` (Vitest), `supabase test db` (pgTAP), `npx playwright test` (e2e).
- Seed UUIDs (used in tests): super_admin `11111111-1111-1111-1111-111111111111`, admin `22222222-2222-2222-2222-222222222222`, educator `33333333-3333-3333-3333-333333333333`, KG-A `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`.

---

### Task 1: DB Migration — role-assignment hardening + RLS tightening

Closes **Security H1** (trigger layer), **Security H2** (trigger), **Security H3** (RLS).

**Files:**
- Create: `supabase/migrations/20260627200000_role_assignment_hardening.sql`
- Modify: `supabase/tests/security_triggers.test.sql` (update Test 9 message + add Test 10)

**What changes and why:**
- `prevent_self_privilege_escalation` currently only blocks granting/revoking the `super_admin` role. Extend it to block ANY role change by a non-super_admin. This closes H2 (admin can promote an educator to admin via direct PATCH) at the DB level.
- `user_kindergartens_insert` RLS currently allows admins to attach any `user_id` to their kindergarten — H3. All legitimate staff additions go through the service-role invite route (bypasses RLS). Remove the admin clause so only super_admin (and service role) can insert.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260627200000_role_assignment_hardening.sql`:

```sql
-- 20260627200000_role_assignment_hardening.sql
--
-- Closes Security H2 + H3 at the DB layer:
--   H2: extend prevent_self_privilege_escalation so only super_admin may change
--       role on ANY row (was: only super_admin grants/revokes were blocked).
--   H3: tighten user_kindergartens_insert — remove admin clause.
--       All admin staff additions go through the service-role invite route
--       which bypasses RLS; no authenticated-client path for admin inserts exists.

-- ── 1) Extend trigger ────────────────────────────────────────────────────────

create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role writes (auth.uid() IS NULL) bypass all checks — intentional.
  if auth.uid() is null then
    return new;
  end if;

  -- Self-update guard: authenticated users cannot change their own
  -- role/status/deleted_at/email via the public.users table.
  if new.id = auth.uid() then
    if new.role is distinct from old.role then
      raise exception 'cannot change own role' using errcode = 'insufficient_privilege';
    end if;
    if new.status is distinct from old.status then
      raise exception 'cannot change own status' using errcode = 'insufficient_privilege';
    end if;
    if new.deleted_at is distinct from old.deleted_at then
      raise exception 'cannot change own deleted_at' using errcode = 'insufficient_privilege';
    end if;
    if new.email is distinct from old.email then
      raise exception 'cannot change own email' using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Role-change guard: only super_admin may change role on ANY row.
  -- This closes the admin→admin-promotion path (H2) and supersedes the
  -- narrower "super_admin grant/revoke" check from 20260627000000.
  if new.role is distinct from old.role then
    if not public.is_super_admin() then
      raise exception 'only super_admin may change user roles'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

-- ── 2) Tighten user_kindergartens_insert ────────────────────────────────────
-- Remove the admin clause: there is no legitimate authenticated-client INSERT
-- path for admins. All staff additions go through the service-role invite route.

drop policy user_kindergartens_insert on public.user_kindergartens;
create policy user_kindergartens_insert on public.user_kindergartens
  for insert
  with check ((select public.is_super_admin()));
```

- [ ] **Step 2: Apply the migration locally**

```bash
supabase db reset
```

Expected: migration runs without errors, seed data loads.

- [ ] **Step 3: Update security_triggers.test.sql — Test 9 message + plan count + Test 10**

The trigger message changed from `'only super_admin may grant or revoke the super_admin role'` to `'only super_admin may change user roles'`. Also update `SELECT plan(9)` → `SELECT plan(10)` and add Test 10.

In `supabase/tests/security_triggers.test.sql`, make these three edits:

**Edit A** — update plan count (line 31):
```sql
-- OLD:
SELECT plan(9);
-- NEW:
SELECT plan(10);
```

**Edit B** — update Test 9 expected message (around line 94):
```sql
-- OLD:
  '42501',
  'only super_admin may grant or revoke the super_admin role',
  'admin cannot promote another user to super_admin (proxy-escalation blocked)'
-- NEW:
  '42501',
  'only super_admin may change user roles',
  'admin cannot promote another user to super_admin (proxy-escalation blocked)'
```

**Edit C** — add Test 10 after Test 9 (before the `-- ── Switch to super_admin session` comment):
```sql
-- ── Test 10: admin cannot change another user's role to a non-super_admin role ──
-- The original guard only blocked super_admin promotion; this verifies the
-- new blanket rule: only super_admin may change role at all.
-- Context is still the admin user (22222222) from the SET LOCAL above.
SELECT throws_ok(
  $$UPDATE public.users SET role = 'admin' WHERE id = '33333333-3333-3333-3333-333333333333'$$,
  '42501',
  'only super_admin may change user roles',
  'admin cannot change another user role even to a non-super_admin role'
);
```

- [ ] **Step 4: Run pgTAP tests**

```bash
supabase test db
```

Expected: all 10 tests pass. If Test 9 fails with wrong message, check that `supabase db reset` ran after the migration was added.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260627200000_role_assignment_hardening.sql supabase/tests/security_triggers.test.sql
git commit -m "fix(security): extend role-change guard to block all non-super_admin role mutations + tighten user_kindergartens_insert RLS (H2, H3)"
```

---

### Task 2: Invite route — admin role restriction + audit writes

Closes **Security H1** (admin can invite admin) and **Security M1** (invite flow unaudited).

**Files:**
- Modify: `src/server/api/staff/invite.post.ts`
- Modify: `src/server/api/staff/invite.post.test.ts`

**What changes:**
- After the admin's kindergarten membership check (line 44), add: if `callerProfile.role === 'admin'` and `role !== 'educator'` → 403. This closes H1 at the server layer.
- Before `return { success: true }`, write an explicit `audit_logs` row via `adminClient`. The trigger `write_audit_log` early-returns when `auth.uid() IS NULL` (service-role context), so the invite flow is never audited by the trigger. An explicit insert is the only way to log it. Audit failure is non-fatal (log + continue).
- Update `invite.post.test.ts`: add one test for the new 403 case; add one `mockReturnValueOnce` for the audit insert to each success-path test.

- [ ] **Step 1: Write the failing test for admin-inviting-admin**

Add this test to `src/server/api/staff/invite.post.test.ts` (insert before the closing `})` of the `describe` block):

```ts
  it('returns 403 when admin tries to invite with role admin', async () => {
    mockReadBody.mockResolvedValue({ ...VALID_BODY, role: 'admin' })
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'admin', status: 'active' }, error: null }))   // caller profile
      .mockReturnValueOnce(makeQuery({ data: { user_id: CALLER_ID }, error: null }))                // membership → member

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 403 })
  })
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
npm run test -- invite.post
```

Expected: the new test fails (no role restriction yet in the route).

- [ ] **Step 3: Add the admin role restriction and audit write to invite.post.ts**

In `src/server/api/staff/invite.post.ts`:

**Edit A** — add role restriction after line 44 (after the membership check `if (!membership)` block):

```ts
  // Admin callers may only invite educators — role escalation via invite is a
  // server-enforced rule, not just a UI constraint.
  if (callerProfile.role === 'admin' && role !== 'educator') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
```

**Edit B** — add audit write after the membership upsert block (before `return { success: true }`), replacing line 103:

```ts
  // Audit: write_audit_log trigger fires only for auth.uid() !== NULL;
  // the service-role context here means auth.uid() IS NULL, so we log explicitly.
  const { error: auditError } = await adminClient.from('audit_logs').insert({
    user_id: caller.id,
    kindergarten_id: kindergartenId,
    action: 'create',
    entity: 'user_kindergartens',
    entity_id: userId,
  })
  if (auditError) {
    console.error('[invite] audit log failed:', auditError.message)
  }

  return { success: true }
```

- [ ] **Step 4: Update success-path tests to include the audit log mock call**

Each success-path test now has one extra `adminClient.from()` call (the audit insert). Add `.mockReturnValueOnce(makeQuery({ data: null, error: null }))` as the last `from()` call in these tests:

**Test: `invites new user and inserts their profile when called by super_admin`** — currently 4 `from()` calls; add one more:
```ts
    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null })) // role check
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // existing user → none
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // insert profile
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // upsert membership
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // audit log
```

**Test: `skips inviteUserByEmail and re-adds existing user to kindergarten`** — currently 3 calls; add one:
```ts
    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { id: EXISTING_USER_ID, role: 'educator' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // upsert membership
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // audit log
```

**Test: `admin who belongs to the kindergarten can invite an educator`** — currently 5 calls; add one:
```ts
    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'admin', status: 'active' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { user_id: CALLER_ID }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // no existing user
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // profile insert
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // membership upsert
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // audit log
```

- [ ] **Step 5: Run all invite tests — expect PASS**

```bash
npm run test -- invite.post
```

Expected: all tests pass (12 original + 1 new = 13 total).

- [ ] **Step 6: Commit**

```bash
git add src/server/api/staff/invite.post.ts src/server/api/staff/invite.post.test.ts
git commit -m "fix(security): block admin-inviting-admin in route + write audit log for invite flow (H1, M1)"
```

---

### Task 3: Performance — `listStaff` single join

Closes **Perf H1**: two sequential round-trips → one embedded join.

**Files:**
- Modify: `src/modules/staff/services/staff.service.ts`
- Modify: `src/modules/staff/services/staff.service.test.ts`

**What changes:**
Current `listStaff` makes two Supabase calls: first fetches `user_kindergartens` for `user_id` list, then fetches `users` with `.in('id', userIds)`. PostgREST supports `!inner` joins that act as filters — rewrite as a single query on `users` with `user_kindergartens!inner(kindergarten_id)` and a filter on the nested column. The mock needs updating to match the new single-chain query shape.

- [ ] **Step 1: Update the mock in staff.service.test.ts**

Replace the entire `createMockClient` function and the mock variable declarations in `staff.service.test.ts`. The new query chains: `from('users').select().eq().is().neq().order()`. The `user_kindergartens` table is no longer queried by `listStaff`.

Replace the mock setup at the top (lines 23-77) with:

```ts
let mockOrder: ReturnType<typeof vi.fn>
let mockNeq: ReturnType<typeof vi.fn>
let mockIs: ReturnType<typeof vi.fn>
let mockEq: ReturnType<typeof vi.fn>

let mockDeleteEq1: ReturnType<typeof vi.fn>
let mockDeleteEq2: ReturnType<typeof vi.fn>

function createMockClient(opts: {
  users?: Array<typeof sampleRow> | null
  queryError?: { message: string } | null
  mutationResult?: typeof sampleRow | null
  deleteError?: { message: string } | null
} = {}) {
  const {
    users = [sampleRow],
    queryError = null,
    mutationResult = sampleRow,
    deleteError = null,
  } = opts

  mockOrder = vi.fn().mockResolvedValue({ data: users, error: queryError })
  mockNeq = vi.fn().mockReturnValue({ order: mockOrder })
  mockIs = vi.fn().mockReturnValue({ neq: mockNeq })
  mockEq = vi.fn().mockReturnValue({ is: mockIs })

  mockDeleteEq2 = vi.fn().mockResolvedValue({ error: deleteError })
  mockDeleteEq1 = vi.fn().mockReturnValue({ eq: mockDeleteEq2 })

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnValue({ eq: mockEq }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mutationResult, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'user_kindergartens') {
        return {
          delete: vi.fn().mockReturnValue({ eq: mockDeleteEq1 }),
        }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}
```

- [ ] **Step 2: Rewrite the `listStaff` describe block tests**

Replace the three tests in `describe('listStaff', ...)` (lines 79-103) with:

```ts
describe('listStaff', () => {
  it('returns users for the given kindergarten via single join, excluding super_admins', async () => {
    const client = createMockClient()
    const result = await listStaff(client, 'kg-1')

    expect(result).toEqual({ success: true, data: [sampleRow] })
    expect(client.from).toHaveBeenCalledWith('users')
    expect(client.from).not.toHaveBeenCalledWith('user_kindergartens')
    expect(mockEq).toHaveBeenCalledWith('user_kindergartens.kindergarten_id', 'kg-1')
  })

  it('returns an empty array when no users match the kindergarten', async () => {
    const client = createMockClient({ users: [] })
    const result = await listStaff(client, 'kg-1')

    expect(result).toEqual({ success: true, data: [] })
  })

  it('filters out soft-deleted rows and super_admin accounts', async () => {
    const client = createMockClient()
    await listStaff(client, 'kg-1')

    expect(mockIs).toHaveBeenCalledWith('deleted_at', null)
    expect(mockNeq).toHaveBeenCalledWith('role', 'super_admin')
  })

  it('returns failure when the query errors', async () => {
    const client = createMockClient({ users: null, queryError: { message: 'db error' } })
    const result = await listStaff(client, 'kg-1')

    expect(result).toEqual({ success: false, error: 'db error' })
  })
})
```

- [ ] **Step 3: Run tests — expect FAIL on listStaff tests**

```bash
npm run test -- staff.service
```

Expected: 4 `listStaff` tests fail (implementation not changed yet), others pass.

- [ ] **Step 4: Rewrite `listStaff` in staff.service.ts**

Replace lines 10-36 (the `listStaff` function) in `src/modules/staff/services/staff.service.ts`:

```ts
export async function listStaff(
  client: Client,
  kindergartenId: string,
): Promise<Result<UserRow[]>> {
  const { data, error } = await client
    .from('users')
    .select('*, user_kindergartens!inner(kindergarten_id)')
    .eq('user_kindergartens.kindergarten_id', kindergartenId)
    .is('deleted_at', null)
    .neq('role', 'super_admin')
    .order('full_name')

  if (error || !data) return { success: false, error: error?.message ?? 'list_failed' }
  return {
    success: true,
    data: data.map(({ user_kindergartens: _join, ...user }) => user as UserRow),
  }
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm run test -- staff.service
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/modules/staff/services/staff.service.ts src/modules/staff/services/staff.service.test.ts
git commit -m "perf: collapse listStaff two round-trips into single embedded join (Perf H1)"
```

---

### Task 4: pgTAP — cross-tenant READ isolation tests

Closes **Test H1**: the core multi-tenancy invariant (admin cannot read another tenant's data) was unverified at the DB level.

**Files:**
- Create: `supabase/tests/rls_isolation.test.sql`

**What changes:**
Within a rolled-back transaction, insert a second kindergarten (KG-B) and a user assigned only to KG-B. Simulate the demo admin's JWT (assigned to KG-A only). Assert they see 0 rows from KG-B tables and 1 row from KG-A tables.

**Depends on:** Task 1 (migration applied, `supabase db reset` run).

- [ ] **Step 1: Create the test file**

Create `supabase/tests/rls_isolation.test.sql`:

```sql
-- supabase/tests/rls_isolation.test.sql
--
-- Verifies the core multi-tenancy invariant: an admin assigned to KG-A cannot
-- read users or kindergartens that belong only to KG-B.
--
-- Run with: supabase test db
--
-- Relies on seed users (populated by `supabase db reset`):
--   22222222-2222-2222-2222-222222222222  admin  (assigned to KG-A only)
--   aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa  Grădinița Zâna Florilor (KG-A)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = '22222222-2222-2222-2222-222222222222'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.kindergartens WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) THEN
    RAISE EXCEPTION 'Seed data missing — run "supabase db reset" before "supabase test db"';
  END IF;
END $$;

BEGIN;
SELECT plan(4);

-- ── Setup: KG-B and a user assigned only to KG-B ────────────────────────────
-- All data is rolled back at the end; doesn't pollute the dev DB.

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'authenticated', 'authenticated',
  'kgb-user@test.local',
  crypt('TestPass123!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);

INSERT INTO public.users (id, email, full_name, role, status)
VALUES (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'kgb-user@test.local',
  'KG-B Educator',
  'educator',
  'active'
);

INSERT INTO public.kindergartens (id, name, address, city, status, settings, created_by)
VALUES (
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'Grădinița B',
  'Str. Test nr. 1',
  'București',
  'active',
  '{"timezone":"Europe/Bucharest","default_locale":"ro","working_hours":{"start":"08:00","end":"17:00"}}'::jsonb,
  '11111111-1111-1111-1111-111111111111'
);

INSERT INTO public.user_kindergartens (user_id, kindergarten_id, created_by)
VALUES (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  '11111111-1111-1111-1111-111111111111'
);

-- ── Simulate admin session (KG-A only) ───────────────────────────────────────
SET LOCAL "request.jwt.claims" = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

-- ── Test 1: admin cannot read a user from a different kindergarten ────────────
SELECT is(
  (SELECT count(*) FROM public.users WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  0::bigint,
  'admin cannot read users belonging only to a different kindergarten'
);

-- ── Test 2: admin cannot read a kindergarten they are not assigned to ─────────
SELECT is(
  (SELECT count(*) FROM public.kindergartens WHERE id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'),
  0::bigint,
  'admin cannot read a kindergarten they are not assigned to'
);

-- ── Test 3 (positive): admin CAN read their own kindergarten ──────────────────
SELECT is(
  (SELECT count(*) FROM public.kindergartens WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  1::bigint,
  'admin can read their own kindergarten'
);

-- ── Test 4 (positive): admin CAN read a user from their own kindergarten ──────
SELECT is(
  (SELECT count(*) FROM public.users WHERE id = '33333333-3333-3333-3333-333333333333'),
  1::bigint,
  'admin can read users from their own kindergarten'
);

RESET "request.jwt.claims";
SELECT finish();
ROLLBACK;
```

- [ ] **Step 2: Run pgTAP tests**

```bash
supabase test db
```

Expected: all tests across both files pass (10 from `security_triggers.test.sql` + 4 from `rls_isolation.test.sql` = 14 total).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls_isolation.test.sql
git commit -m "test(db): pgTAP cross-tenant READ isolation — admin blocked from seeing other tenant data (Test H1)"
```

---

### Task 5: Unit tests — `can('assign-role')` + Admin role Playwright e2e

Closes **Test H2** (Admin role has zero e2e coverage) and **Test M1** (`can('assign-role')` boundary untested).

**Files:**
- Modify: `src/shared/composables/usePermissions.test.ts`
- Create: `tests/e2e/admin.spec.ts`

- [ ] **Step 1: Add `can('assign-role')` unit tests**

Append these three tests to the `describe('usePermissions', ...)` block in `src/shared/composables/usePermissions.test.ts` (before the closing `}`):

```ts
  it('lets only super_admin assign roles', () => {
    setUserRole('super_admin')
    const { can } = usePermissions()
    expect(can('assign-role', 'staff')).toBe(true)
  })

  it('denies role assignment for admin', () => {
    setUserRole('admin')
    const { can } = usePermissions()
    expect(can('assign-role', 'staff')).toBe(false)
  })

  it('denies role assignment for educator', () => {
    setUserRole('educator')
    const { can } = usePermissions()
    expect(can('assign-role', 'staff')).toBe(false)
  })
```

- [ ] **Step 2: Run unit tests — expect PASS**

```bash
npm run test -- usePermissions
```

Expected: 3 new tests pass (the `usePermissions` composable already implements this correctly; we're pinning it against regression).

- [ ] **Step 3: Write the admin e2e spec**

Create `tests/e2e/admin.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill('admin.demo@startica.dev')
  await page.getByLabel('Parolă').fill('Startica123!')
  await page.getByRole('button', { name: /autentificare/i }).click()
  await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 })
}

test.describe('admin role', () => {
  test('admin is redirected away from /kindergartens', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/kindergartens')
    await expect(page).toHaveURL('http://localhost:3000/')
  })

  test('admin sees the staff page and their kindergarten staff', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Personal' }).click()
    await expect(page).toHaveURL('http://localhost:3000/staff')

    await page.locator('select, [role="combobox"]').first().click()
    await page.getByRole('option', { name: 'Grădinița Zâna Florilor' }).click()

    await expect(page.getByRole('cell', { name: 'Elena Popescu' })).toBeVisible()
  })

  test('admin can invite an educator', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Personal' }).click()

    await page.locator('select, [role="combobox"]').first().click()
    await page.getByRole('option', { name: 'Grădinița Zâna Florilor' }).click()
    await expect(page.getByRole('cell', { name: 'Elena Popescu' })).toBeVisible()

    const uniqueEmail = `admin-invited-${Date.now()}@example.com`
    await page.getByRole('button', { name: 'Invită' }).click()
    const inviteDialog = page.getByRole('dialog')
    await inviteDialog.getByLabel('Email').fill(uniqueEmail)
    await inviteDialog.getByLabel('Nume complet').fill('Educator Nou Admin')
    await inviteDialog.getByRole('button', { name: 'Invită' }).click()
    await expect(page.getByText('Invitația a fost trimisă.', { exact: true })).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('cell', { name: 'Educator Nou Admin' }).first()).toBeVisible()
  })

  test('admin invite dialog does not offer the admin role option', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Personal' }).click()

    await page.locator('select, [role="combobox"]').first().click()
    await page.getByRole('option', { name: 'Grădinița Zâna Florilor' }).click()

    await page.getByRole('button', { name: 'Invită' }).click()
    const inviteDialog = page.getByRole('dialog')

    // The role select (if present) must not expose the 'admin' option
    const roleSelect = inviteDialog.locator('select[name="role"], [data-testid="role-select"]')
    if (await roleSelect.isVisible()) {
      await expect(inviteDialog.getByRole('option', { name: /^admin$/i })).not.toBeVisible()
    }
    // If there is no role field at all, the invite is implicitly educator-only — also valid
  })
})
```

- [ ] **Step 4: Start the dev server and run e2e tests**

First ensure local Supabase is running with fresh seed:
```bash
supabase db reset
```

Then in another terminal:
```bash
npm run dev
```

Then run only the admin spec:
```bash
npx playwright test tests/e2e/admin.spec.ts
```

Expected: all 4 admin tests pass. If the "no admin role option" test flakes because there's no role field at all in the admin invite dialog, the test is written to handle that gracefully (the `if (await roleSelect.isVisible())` guard).

- [ ] **Step 5: Run full e2e suite to check for regressions**

```bash
npx playwright test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/composables/usePermissions.test.ts tests/e2e/admin.spec.ts
git commit -m "test: pin can('assign-role') boundary + add Admin role e2e coverage (Test H2, M1)"
```

---

## Self-Review

### Spec coverage

| Finding | Covered by |
|---------|-----------|
| Security H1 — admin can invite admin | Task 2 (route guard) + Task 2 (test) |
| Security H2 — admin can promote roles via PATCH | Task 1 (trigger) + Task 1 (pgTAP Test 10) |
| Security H3 — admin can attach arbitrary users | Task 1 (RLS policy) |
| Security M1 — invite flow unaudited | Task 2 (explicit audit insert) |
| Perf H1 — `listStaff` two round-trips | Task 3 |
| Test H1 — no cross-tenant READ isolation test | Task 4 |
| Test H2 — Admin role has zero e2e | Task 5 |
| Test M1 — `can('assign-role')` untested | Task 5 |

**Not included (deferred, lower priority):**
- Perf M2/M3: `select('*')` and pagination — architectural changes best done separately.
- Security M2: hard delete of `user_kindergartens` — a policy decision, not a bug.
- Test M2/M3: store/service error-path coverage — valuable but not merge-blocking.
- Test M4/M5: admin-inviting-admin pin + kindergarten switch isolation e2e — lower priority after H1/H2 merged.

### Placeholder scan

No TBDs, no "similar to Task N" references. All steps contain exact commands and complete code blocks.

### Type consistency

- `UserRow` is used as the return type of `listStaff` in all tasks — consistent.
- `makeQuery` helper is referenced in Task 2 tests without modification to its shape — consistent with the existing helper in `invite.post.test.ts`.
- pgTAP UUIDs for seed users match the `supabase/seed.sql` values — verified against source.
