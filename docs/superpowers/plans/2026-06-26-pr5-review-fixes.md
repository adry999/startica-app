# PR #5 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all HIGH/CRITICAL findings from the three-angle review of PR #5 (security, performance, test coverage).

**Architecture:** Eight independent tasks — two DB migrations, two code fixes in existing files, one test fix, one test addition, one pgTAP suite, one e2e test. All tasks touch distinct files and can be implemented in any order; Task 4 should follow Task 2 since it tests the S2 guard Task 2 adds.

**Tech Stack:** Nuxt 3, TypeScript, Supabase (Postgres + RLS + pgTAP), Vitest, Playwright, Vue 3.

## Global Constraints

- Every migration: new file under `supabase/migrations/` with timestamp prefix; run `supabase db reset` locally to verify, then `supabase gen types typescript --local > src/core/supabase/types.ts`.
- No hard-DELETEs on business data; soft delete only (`deleted_at = now()`).
- No hardcoded user-facing strings — all through i18n keys.
- RLS enabled on all tables; standard read pattern: `kindergarten_id IN (SELECT ... FROM user_kindergartens WHERE user_id = auth.uid()) AND deleted_at IS NULL`.
- Services are the only DB callers — components and stores never call Supabase directly.
- Test commands: `npm run test` (Vitest), `supabase test db` (pgTAP), `npx playwright test` (e2e).

---

### Task 1: Security migration — S1 (admin→super_admin attack) + S3 (email self-change)

**Files:**
- Create: `supabase/migrations/20260626210000_security_review_fixes.sql`

**Why:**
- S1: `users_update_admin` lets an admin UPDATE any shared-kindergarten user including super_admins — enables account DoS + identity tampering.
- S3: `users_update_self` + trigger allow a user to change their own `public.users.email`, desyncing it from `auth.users.email` (impersonation risk).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260626210000_security_review_fixes.sql
--
-- S1: Prevent non-super_admins from modifying super_admin rows.
--     The admin branch of users_update_admin now excludes rows where
--     the target's current role is super_admin.
-- S3: Block authenticated users from changing their own email via
--     the public.users table (would desync from auth.users.email).
--     Extends prevent_self_privilege_escalation trigger.
-- P1-partial: Wrap bare is_super_admin()/current_user_role() in (select …)
--     in users_update_admin so the planner hoists them to once-per-statement
--     InitPlans instead of re-evaluating per scanned row.

-- ============================================================================
-- S3: extend trigger to block self-email changes
-- ============================================================================

create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role writes (auth.uid() IS NULL) bypass all checks — intentional.
  if auth.uid() is not null and new.id = auth.uid() then
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
  return new;
end;
$$;

-- Trigger already exists from security_fixes migration; replace function only
-- (CREATE OR REPLACE above is sufficient — the trigger binding is unchanged).

-- ============================================================================
-- S1 + P1: recreate users_update_admin
--   - admin branch now excludes rows where users.role = 'super_admin'
--   - wrap bare helper calls in (select …) for planner hoisting
-- ============================================================================

drop policy users_update_admin on public.users;
create policy users_update_admin on public.users
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        users.role != 'super_admin'
        and (select public.current_user_role()) = 'admin'
        and exists (
          select 1 from public.user_kindergartens uk1
          join public.user_kindergartens uk2 on uk1.kindergarten_id = uk2.kindergarten_id
          where uk1.user_id = auth.uid() and uk2.user_id = users.id
        )
      )
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and exists (
        select 1 from public.user_kindergartens uk1
        join public.user_kindergartens uk2 on uk1.kindergarten_id = uk2.kindergarten_id
        where uk1.user_id = auth.uid() and uk2.user_id = users.id
      )
    )
  );
```

- [ ] **Step 2: Apply and verify locally**

```bash
supabase db reset
# Expected: no errors, all migrations apply cleanly
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260626210000_security_review_fixes.sql
git commit -m "fix(security): block admin from modifying super_admin rows; block email self-change (S1+S3)"
```

---

### Task 2: Invite route hardening — S2 (super_admin injection) + S4 (error leak)

**Files:**
- Modify: `src/server/api/staff/invite.post.ts`

**Why:**
- S2: The existing-user branch adds any account (including super_admins) to the caller's kindergarten by email — enables the S1 chain attack.
- S4: `inviteError.message`, `profileError.message`, `memberError.message` are returned verbatim as 500 bodies, leaking DB/auth internals.

- [ ] **Step 1: Update the existing-user lookup to include role, and guard against super_admin**

Replace lines 41–46 of `src/server/api/staff/invite.post.ts`:

```ts
// Before:
  const { data: existing } = await adminClient
    .from('users')
    .select('id')
    .eq('email', email)
    .is('deleted_at', null)
    .maybeSingle()
```

```ts
// After:
  const { data: existing } = await adminClient
    .from('users')
    .select('id, role')
    .eq('email', email)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing?.role === 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
```

- [ ] **Step 2: Sanitize the three 500 error messages**

Replace lines 62–63, 76–78, 87–89:

```ts
// Line 62-63 — Before:
    if (inviteError || !inviteData.user) {
      throw createError({ statusCode: 500, statusMessage: inviteError?.message ?? 'invite_failed' })
    }

// After:
    if (inviteError || !inviteData.user) {
      console.error('[invite] inviteUserByEmail failed:', inviteError?.message)
      throw createError({ statusCode: 500, statusMessage: 'invite_failed' })
    }
```

```ts
// Line 76-78 — Before:
    if (profileError) {
      throw createError({ statusCode: 500, statusMessage: profileError.message })
    }

// After:
    if (profileError) {
      console.error('[invite] profile insert failed:', profileError.message)
      throw createError({ statusCode: 500, statusMessage: 'profile_insert_failed' })
    }
```

```ts
// Line 87-89 — Before:
  if (memberError) {
    throw createError({ statusCode: 500, statusMessage: memberError.message })
  }

// After:
  if (memberError) {
    console.error('[invite] membership upsert failed:', memberError.message)
    throw createError({ statusCode: 500, statusMessage: 'membership_failed' })
  }
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
# Expected: no errors
```

- [ ] **Step 4: Commit**

```bash
git add src/server/api/staff/invite.post.ts
git commit -m "fix(security): block super_admin injection via invite; sanitize 500 error messages (S2+S4)"
```

---

### Task 3: Fix listStaff filter test — T3

**Files:**
- Modify: `src/modules/staff/services/staff.service.test.ts`

**Why:** The test asserts `result` equals `[sampleRow]` but the mock always returns that regardless of query chain — `.neq('role','super_admin')` and `.is('deleted_at', null)` could be deleted from the service and the test would still pass.

- [ ] **Step 1: Expose the filter mock functions at module level**

In `staff.service.test.ts`, add two module-level `let` declarations and update the `createMockClient` function to capture them:

Replace lines 23–72 (the `createMockClient` function) with:

```ts
let mockIs: ReturnType<typeof vi.fn>
let mockNeq: ReturnType<typeof vi.fn>

function createMockClient(opts: {
  memberships?: Array<{ user_id: string }>
  users?: typeof sampleRow[]
  mutationResult?: typeof sampleRow | null
  deleteError?: { message: string } | null
} = {}) {
  const {
    memberships = [{ user_id: 'user-2' }],
    users = [sampleRow],
    mutationResult = sampleRow,
    deleteError = null,
  } = opts

  mockNeq = vi.fn().mockReturnValue({
    order: vi.fn().mockResolvedValue({ data: users, error: null }),
  })
  mockIs = vi.fn().mockReturnValue({ neq: mockNeq })

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'user_kindergartens') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: memberships, error: null }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: deleteError }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({ is: mockIs }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mutationResult, error: null }),
            }),
          }),
        }),
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}
```

- [ ] **Step 2: Add the filter assertion test**

After the existing `'returns an empty array when the kindergarten has no members'` test (line 89), add:

```ts
  it('filters out soft-deleted rows and super_admin accounts', async () => {
    const client = createMockClient()
    await listStaff(client, 'kg-1')

    expect(mockIs).toHaveBeenCalledWith('deleted_at', null)
    expect(mockNeq).toHaveBeenCalledWith('role', 'super_admin')
  })
```

- [ ] **Step 3: Run the test suite**

```bash
npm run test -- staff.service
# Expected: all tests pass including the new filter assertion
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/staff/services/staff.service.test.ts
git commit -m "test(staff): assert listStaff applies super_admin and soft-delete filters (T3)"
```

---

### Task 4: Add missing invite.post tests — T5 + S2 regression

**Files:**
- Modify: `src/server/api/staff/invite.post.test.ts`

**Why:** Missing tests: three 500 paths (`inviteError`, `profileError`, `memberError`), the admin happy-path (only admin *rejection* is tested), and a regression test for the S2 super_admin injection fix.

- [ ] **Step 1: Add 500 branch tests and admin happy-path**

Append to the `describe('POST /api/staff/invite')` block after line 135:

```ts
  it('returns 500 when inviteUserByEmail fails', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null })) // no existing user

    mockAdminClient.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: 'smtp_error' },
    })

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 500 })
  })

  it('returns 500 when profile insert fails', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    const NEW_USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                       // no existing user
      .mockReturnValueOnce(makeQuery({ data: null, error: { message: 'db_error' } }))   // profile insert fails

    mockAdminClient.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 500 })
  })

  it('returns 500 when membership upsert fails', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    const NEW_USER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                      // no existing user
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                      // profile insert ok
      .mockReturnValueOnce(makeQuery({ data: null, error: { message: 'fk_error' } }))  // membership fails

    mockAdminClient.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 500 })
  })

  it('admin who belongs to the kindergarten can invite an educator', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    const NEW_USER_ID = '11111111-1111-4111-8111-111111111111'

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'admin' }, error: null }))         // caller role
      .mockReturnValueOnce(makeQuery({ data: { user_id: CALLER_ID }, error: null }))    // membership check → member
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                      // no existing user
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                      // profile insert
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                      // membership upsert

    mockAdminClient.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    const result = await ((handler as unknown) as RouteHandler)({})
    expect(result).toEqual({ success: true })
  })

  it('returns 403 when trying to add an existing super_admin to a kindergarten', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin' }, error: null }))  // caller is super_admin
      .mockReturnValueOnce(makeQuery({ data: { id: 'target-id', role: 'super_admin' }, error: null })) // target is also super_admin

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 403 })
    expect(mockAdminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the test suite**

```bash
npm run test -- invite.post
# Expected: all tests pass (11 total)
```

- [ ] **Step 3: Commit**

```bash
git add src/server/api/staff/invite.post.test.ts
git commit -m "test(staff): add 500 branches, admin happy-path, and S2 regression test (T5)"
```

---

### Task 5: RLS performance migration — P1

**Files:**
- Create: `supabase/migrations/20260626210001_rls_perf_wrap_helpers.sql`

**Why:** `is_super_admin()` and `current_user_role()` appear bare in 13 policies — the planner evaluates them per scanned row (one `SELECT FROM users WHERE id = auth.uid()` each). Wrapping in `(select …)` hoists them to once-per-statement InitPlans.

Note: `users_update_admin` was already fixed in Task 1. This migration covers all remaining policies.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260626210001_rls_perf_wrap_helpers.sql
--
-- Wrap bare is_super_admin() / current_user_role() calls in (select …) so the
-- Postgres planner treats them as InitPlans (evaluated once per statement) rather
-- than per-row volatile calls.
-- Covers all policies NOT already recreated in 20260626210000.

-- users_select
drop policy users_select on public.users;
create policy users_select on public.users
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or id = auth.uid()
      or (
        (select public.current_user_role()) = 'admin'
        and exists (
          select 1 from public.user_kindergartens uk1
          join public.user_kindergartens uk2 on uk1.kindergarten_id = uk2.kindergarten_id
          where uk1.user_id = auth.uid() and uk2.user_id = users.id
        )
      )
    )
  );

-- kindergartens_select
drop policy kindergartens_select on public.kindergartens;
create policy kindergartens_select on public.kindergartens
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or id in (select public.user_kindergarten_ids())
    )
  );

-- kindergartens_insert
drop policy kindergartens_insert on public.kindergartens;
create policy kindergartens_insert on public.kindergartens
  for insert
  with check ((select public.is_super_admin()));

-- kindergartens_update
drop policy kindergartens_update on public.kindergartens;
create policy kindergartens_update on public.kindergartens
  for update
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- user_kindergartens_select
drop policy user_kindergartens_select on public.user_kindergartens;
create policy user_kindergartens_select on public.user_kindergartens
  for select
  using (
    (select public.is_super_admin())
    or user_id = auth.uid()
    or kindergarten_id in (select public.user_kindergarten_ids())
  );

-- user_kindergartens_insert
drop policy user_kindergartens_insert on public.user_kindergartens;
create policy user_kindergartens_insert on public.user_kindergartens
  for insert
  with check (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

-- user_kindergartens_delete
drop policy user_kindergartens_delete on public.user_kindergartens;
create policy user_kindergartens_delete on public.user_kindergartens
  for delete
  using (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

-- groups_select
drop policy groups_select on public.groups;
create policy groups_select on public.groups
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or educator_id = auth.uid()
        )
      )
    )
  );

-- groups_insert
drop policy groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert
  with check (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

-- groups_update (recreated in security_fixes but still bare)
drop policy groups_update on public.groups;
create policy groups_update on public.groups
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        (select public.current_user_role()) = 'admin'
        and kindergarten_id in (select public.user_kindergarten_ids())
      )
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

-- children_select
drop policy children_select on public.children;
create policy children_select on public.children
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or group_id in (select id from public.groups where educator_id = auth.uid())
        )
      )
    )
  );

-- children_insert
drop policy children_insert on public.children;
create policy children_insert on public.children
  for insert
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or (
          (select public.current_user_role()) = 'educator'
          and group_id in (select id from public.groups where educator_id = auth.uid())
        )
      )
    )
  );

-- children_update (recreated in security_fixes but still bare)
drop policy children_update on public.children;
create policy children_update on public.children
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or (
            (select public.current_user_role()) = 'educator'
            and group_id in (select id from public.groups where educator_id = auth.uid())
          )
        )
      )
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or (
          (select public.current_user_role()) = 'educator'
          and group_id in (select id from public.groups where educator_id = auth.uid())
        )
      )
    )
  );

-- parents_select
drop policy parents_select on public.parents;
create policy parents_select on public.parents
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or exists (
            select 1 from public.children c
            join public.groups g on g.id = c.group_id
            where c.id = parents.child_id and g.educator_id = auth.uid()
          )
        )
      )
    )
  );

-- parents_insert
drop policy parents_insert on public.parents;
create policy parents_insert on public.parents
  for insert
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or exists (
          select 1 from public.children c
          join public.groups g on g.id = c.group_id
          where c.id = parents.child_id and g.educator_id = auth.uid()
        )
      )
    )
  );

-- parents_update (recreated in security_fixes but still bare)
drop policy parents_update on public.parents;
create policy parents_update on public.parents
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or exists (
            select 1 from public.children c
            join public.groups g on g.id = c.group_id
            where c.id = parents.child_id and g.educator_id = auth.uid()
          )
        )
      )
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or exists (
          select 1 from public.children c
          join public.groups g on g.id = c.group_id
          where c.id = parents.child_id and g.educator_id = auth.uid()
        )
      )
    )
  );
```

- [ ] **Step 2: Apply and verify locally**

```bash
supabase db reset
# Expected: all migrations apply cleanly
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260626210001_rls_perf_wrap_helpers.sql
git commit -m "perf(db): wrap RLS helper functions in (select …) for once-per-statement evaluation (P1)"
```

---

### Task 6: Component perf fixes — P2 (resolveComponent) + P3 (can() per row)

**Files:**
- Modify: `src/modules/staff/pages/StaffListPage.vue`
- Modify: `src/modules/kindergartens/pages/KindergartensListPage.vue`

**Why:** `resolveComponent` and `can()` are called inside `cell` render functions — once per cell per row on every re-render. Hoisting to setup-level constants/computeds eliminates the repeated lookups.

- [ ] **Step 1: Fix StaffListPage.vue**

Replace the `<script setup>` block's top imports and add hoisted refs. In `StaffListPage.vue`:

After line 2 (`import { h, reactive, ref, computed } from 'vue'`), no change needed — `computed` is already imported.

After line 17 (`const { items, loading, fetchAll, invite, updateProfile, setStatus, remove } = useStaff()`), add:

```ts
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const canUpdateStaff = computed(() => can('update', 'staff'))
const canDeleteStaff = computed(() => can('delete', 'staff'))
```

Then in the `columns` computed (lines 145–196), replace every `resolveComponent('UBadge')`, `resolveComponent('UButton')`, `can('update', 'staff')`, and `can('delete', 'staff')` with the hoisted refs:

```ts
const columns = computed<TableColumn<StaffMember>[]>(() => [
  { accessorKey: 'fullName', header: t('staff.table.name') },
  { accessorKey: 'email', header: t('staff.table.email') },
  {
    accessorKey: 'role',
    header: t('staff.table.role'),
    cell: ({ row }) =>
      h(
        UBadge,
        { color: roleBadgeColor(row.original.role), variant: 'soft' },
        () => t(`staff.role.${row.original.role}`),
      ),
  },
  {
    accessorKey: 'status',
    header: t('staff.table.status'),
    cell: ({ row }) =>
      h(
        UBadge,
        { color: row.original.status === 'active' ? 'success' : 'neutral', variant: 'soft' },
        () => t(`staff.status.${row.original.status}`),
      ),
  },
  {
    id: 'actions',
    header: t('staff.table.actions'),
    cell: ({ row }) =>
      h('div', { class: 'flex gap-2' }, [
        canUpdateStaff.value
          ? h(
              UButton,
              { size: 'xs', color: 'neutral', variant: 'soft', onClick: () => openEdit(row.original) },
              () => t('common.edit'),
            )
          : null,
        canUpdateStaff.value
          ? h(
              UButton,
              { size: 'xs', color: 'neutral', variant: 'soft', onClick: () => openStatusConfirm(row.original) },
              () => row.original.status === 'active' ? t('staff.deactivate') : t('staff.reactivate'),
            )
          : null,
        canDeleteStaff.value
          ? h(
              UButton,
              { size: 'xs', color: 'error', variant: 'soft', onClick: () => openRemoveConfirm(row.original) },
              () => t('staff.remove'),
            )
          : null,
      ]),
  },
])
```

- [ ] **Step 2: Fix KindergartensListPage.vue**

After line 15 (`const { items, loading, fetchAll, create, updateDetails, updateSettings, setStatus } = useKindergartens()`), add:

```ts
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const canUpdateKindergarten = computed(() => can('update', 'kindergarten'))
```

Then in the `columns` computed (lines 84–123), replace all `resolveComponent(...)` and `can(...)` calls:

```ts
const columns = computed<TableColumn<Kindergarten>[]>(() => [
  { accessorKey: 'name', header: t('kindergartens.table.name') },
  { accessorKey: 'city', header: t('kindergartens.table.city') },
  {
    accessorKey: 'status',
    header: t('kindergartens.table.status'),
    cell: ({ row }) =>
      h(
        UBadge,
        { color: row.original.status === 'active' ? 'success' : 'neutral', variant: 'soft' },
        () => t(`kindergartens.status.${row.original.status}`),
      ),
  },
  {
    accessorKey: 'createdAt',
    header: t('kindergartens.table.createdAt'),
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString('ro-RO'),
  },
  {
    id: 'actions',
    header: t('kindergartens.table.actions'),
    cell: ({ row }) =>
      h('div', { class: 'flex gap-2' }, [
        canUpdateKindergarten.value
          ? h(
              UButton,
              { size: 'xs', color: 'neutral', variant: 'soft', onClick: () => openEdit(row.original) },
              () => t('common.edit'),
            )
          : null,
        canUpdateKindergarten.value
          ? h(
              UButton,
              { size: 'xs', color: 'neutral', variant: 'soft', onClick: () => openConfirm(row.original) },
              () => t(row.original.status === 'active' ? 'kindergartens.suspend' : 'kindergartens.reactivate'),
            )
          : null,
      ]),
  },
])
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
# Expected: no errors
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/staff/pages/StaffListPage.vue src/modules/kindergartens/pages/KindergartensListPage.vue
git commit -m "perf(ui): hoist resolveComponent and can() out of cell render functions (P2+P3)"
```

---

### Task 7: DB trigger pgTAP tests — T1

**Files:**
- Create: `supabase/tests/security_triggers.test.sql`

**Why:** The privilege escalation trigger and audit log trigger are the headline security features of this PR — they have zero automated tests. A regression in a future migration would silently re-open the vulnerabilities.

- [ ] **Step 1: Create the pgTAP test file**

```sql
-- supabase/tests/security_triggers.test.sql
-- Tests for:
--   1. prevent_self_privilege_escalation trigger (C1 + S3 fixes)
--   2. write_audit_log trigger (audit enforcement)
--
-- Run with: supabase test db

BEGIN;
SELECT plan(8);

-- ── Setup ────────────────────────────────────────────────────────────────────

-- Insert a test super_admin and a test admin using service_role
-- (bypasses RLS, auth.uid() IS NULL → trigger allows all fields)
INSERT INTO public.users (id, email, full_name, role, status, created_by, updated_by)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'sa@test.local',    'Super Admin Test', 'super_admin', 'active', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'admin@test.local', 'Admin Test',       'admin',       'active', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000');

-- ── Test 1: service_role can change role (trigger bypass) ────────────────────
-- auth.uid() IS NULL for service_role → trigger allows the update
SELECT lives_ok(
  $$UPDATE public.users SET role = 'educator' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002'$$,
  'service_role can change any field (trigger bypass)'
);

-- Reset
UPDATE public.users SET role = 'admin' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002';

-- ── Simulate authenticated session (auth.uid() = admin user) ────────────────
-- Supabase local: set request.jwt.claims to simulate the admin user
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-0000-4000-8000-000000000002", "role": "authenticated"}';

-- ── Test 2: authenticated user cannot change own role ────────────────────────
SELECT throws_ok(
  $$UPDATE public.users SET role = 'super_admin' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002'$$,
  'insufficient_privilege',
  'cannot change own role',
  'authenticated user cannot self-escalate role'
);

-- ── Test 3: authenticated user cannot change own status ──────────────────────
SELECT throws_ok(
  $$UPDATE public.users SET status = 'inactive' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002'$$,
  'insufficient_privilege',
  'cannot change own status',
  'authenticated user cannot change own status'
);

-- ── Test 4: authenticated user cannot change own deleted_at ──────────────────
SELECT throws_ok(
  $$UPDATE public.users SET deleted_at = now() WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002'$$,
  'insufficient_privilege',
  'cannot change own deleted_at',
  'authenticated user cannot self-delete'
);

-- ── Test 5: authenticated user cannot change own email (S3 fix) ──────────────
SELECT throws_ok(
  $$UPDATE public.users SET email = 'other@test.local' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002'$$,
  'insufficient_privilege',
  'cannot change own email',
  'authenticated user cannot change own email'
);

-- ── Test 6: authenticated user CAN change own full_name (allowed field) ──────
SELECT lives_ok(
  $$UPDATE public.users SET full_name = 'Admin Renamed' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002'$$,
  'authenticated user can update full_name on own row'
);

-- ── Reset JWT context for remaining tests ────────────────────────────────────
RESET "request.jwt.claims";

-- ── Test 7: audit_logs row is written on UPDATE ───────────────────────────────
DO $$
DECLARE
  before_count INT;
  after_count INT;
BEGIN
  SELECT count(*) INTO before_count FROM public.audit_logs WHERE table_name = 'users';
  UPDATE public.users SET full_name = 'Audit Trigger Test' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001';
  SELECT count(*) INTO after_count FROM public.audit_logs WHERE table_name = 'users';
  IF after_count <= before_count THEN
    RAISE EXCEPTION 'Expected audit_logs row to be written on UPDATE';
  END IF;
END $$;
SELECT ok(true, 'audit_logs row is written on UPDATE');

-- ── Test 8: audit_logs row is written on INSERT ───────────────────────────────
DO $$
DECLARE
  before_count INT;
  after_count INT;
BEGIN
  SELECT count(*) INTO before_count FROM public.audit_logs WHERE table_name = 'users';
  INSERT INTO public.users (id, email, full_name, role, status, created_by, updated_by)
  VALUES ('aaaaaaaa-0000-4000-8000-000000000099', 'audit@test.local', 'Audit Insert', 'educator', 'active',
          '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000');
  SELECT count(*) INTO after_count FROM public.audit_logs WHERE table_name = 'users';
  IF after_count <= before_count THEN
    RAISE EXCEPTION 'Expected audit_logs row to be written on INSERT';
  END IF;
END $$;
SELECT ok(true, 'audit_logs row is written on INSERT');

SELECT finish();
ROLLBACK;
```

- [ ] **Step 2: Run the pgTAP suite**

```bash
supabase test db
# Expected: 1..8 — all 8 tests pass, output ends with "ok"
```

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/security_triggers.test.sql
git commit -m "test(db): pgTAP suite for privilege escalation and audit triggers (T1)"
```

---

### Task 8: Accept-invite e2e — T2

**Files:**
- Create: `tests/e2e/accept-invite.spec.ts`

**Why:** `AcceptInvitePage.vue` is a critical auth flow (invite link → session → set password → dashboard) with no test at any level. A regression would silently break staff onboarding.

**How it works:** Supabase's `generateLink` admin API returns an invite URL with a `?code=` token. Playwright navigates to it, Supabase JS auto-exchanges the code on mount, then the page shows the set-password form.

- [ ] **Step 1: Create the e2e test**

```ts
// tests/e2e/accept-invite.spec.ts
import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SITE_URL = 'http://localhost:3000'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Parolă').fill('Startica123!')
  await page.getByRole('button', { name: /autentificare/i }).click()
  await expect(page).toHaveURL(`${SITE_URL}/`, { timeout: 10000 })
}

test.describe('accept-invite flow', () => {
  test('invited user can set a password and land on the dashboard', async ({ page }) => {
    // 1. Super admin invites a new educator via the UI
    await login(page, 'admin@startica.dev')

    await page.getByRole('link', { name: 'Personal' }).click()
    await page.locator('select, [role="combobox"]').first().click()
    await page.getByRole('option', { name: 'Grădinița Zâna Florilor' }).click()

    const inviteEmail = `invite-e2e-${Date.now()}@example.com`
    await page.getByRole('button', { name: 'Invită' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Email').fill(inviteEmail)
    await dialog.getByLabel('Nume complet').fill('E2E Invitat')
    await dialog.getByRole('button', { name: 'Invită' }).click()
    await expect(page.getByText('Invitația a fost trimisă.')).toBeVisible({ timeout: 8000 })

    // 2. Generate the invite link via admin API (bypasses email delivery)
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data, error } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email: inviteEmail,
      options: { redirectTo: `${SITE_URL}/accept-invite` },
    })
    expect(error).toBeNull()
    const actionLink = data?.properties?.action_link
    expect(actionLink).toBeTruthy()

    // 3. Open a fresh browser context (no existing session)
    const inviteContext = await page.context().browser()!.newContext()
    const invitePage = await inviteContext.newPage()

    // 4. Navigate to the invite link
    await invitePage.goto(actionLink!)
    await invitePage.waitForURL(`${SITE_URL}/accept-invite**`, { timeout: 10000 })

    // 5. Set password
    await expect(invitePage.getByLabel('Parolă nouă')).toBeVisible({ timeout: 5000 })
    await invitePage.getByLabel('Parolă nouă').fill('NewPassword123!')
    await invitePage.getByLabel('Confirmă parola').fill('NewPassword123!')
    await invitePage.getByRole('button', { name: /salvează|setează/i }).click()

    // 6. Verify redirect to dashboard
    await expect(invitePage).toHaveURL(`${SITE_URL}/`, { timeout: 10000 })

    await inviteContext.close()
  })
})
```

- [ ] **Step 2: Check that SUPABASE_SERVICE_ROLE_KEY is available in the Playwright environment**

Look at `playwright.config.ts` or `.env.test`. The service role key for the local Supabase stack is printed by `supabase start` — it's `supabase status | grep service_role`. Add it to the test env if not already present.

```bash
supabase status
# Copy the "service_role key" value
# Add to .env or playwright.config.ts: SUPABASE_SERVICE_ROLE_KEY=<value>
```

- [ ] **Step 3: Run the e2e test**

```bash
# Ensure dev server + local supabase are running
npx playwright test tests/e2e/accept-invite.spec.ts
# Expected: 1 test passes
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/accept-invite.spec.ts
git commit -m "test(e2e): accept-invite flow — set password and land on dashboard (T2)"
```

---

## Execution order recommendation

Tasks 1, 2, 3, 5, 6, 7, 8 are fully independent — dispatch in parallel.
Task 4 should follow Task 2 (tests the S2 guard that Task 2 implements).
