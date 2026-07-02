# Module Access System Implementation Plan (Sub-project A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the general per-kindergarten module-grant mechanism (`user_modules`) plus the authorization, navigation, and staff-management plumbing that Pool and Payroll will both consume — with no Pool/Payroll feature code.

**Architecture:** A new `user_modules` table stores per-educator, per-kindergarten grants (`pool` / `payroll_own` / `payroll_all`). Grants are loaded once into `auth.store` as a synchronous "claims" cache so the existing synchronous `can()` helper can consult them without becoming async. The sidebar reads `can()` to show/hide Bazin and Salarii. Admins assign grants through a drawer opened from the staff list.

**Tech Stack:** Nuxt 3 / Vue 3 (SSR), TypeScript strict, Supabase Postgres + RLS, Pinia, Nuxt UI + Tailwind, @nuxtjs/i18n, Vitest.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-02-module-access-design.md`. Every task's requirements implicitly include it.
- Every business table has `kindergarten_id` + `created_at` + `updated_at` + `created_by` + `updated_by` + `deleted_at`; soft delete only (never hard DELETE business data); every read filters `deleted_at IS NULL`.
- Services are the **only** layer that talks to Supabase. Components → composable → store → service → Supabase. All data fetching via `useAsyncData` / `useLazyAsyncData`.
- **Modules never import from each other.** Grant-management queries live in the `staff` module; the claims loader lives in the `auth` module. Neither imports the other; both use only `~/core` and `~/shared`.
- All authorization goes through `usePermissions().can(...)` / `payrollScope(...)`. Never scatter `if (role === 'admin')` in components.
- No hardcoded user-facing strings — RO (default) + EN i18n keys for every label.
- Services return `Result<T>` (`~/shared/types/result`). Service functions are standalone exports taking `client` as the first argument (mirror `staff.service.ts`).
- After the migration: regenerate types with `supabase gen types typescript --local > src/core/supabase/types.ts`.
- RLS helpers available (do not redefine): `public.is_super_admin()`, `public.current_user_role()`, `public.user_kindergarten_ids()`. Triggers available: `public.set_updated_at()`, `public.set_audit_columns()`, `public.write_audit_log()`.
- Run a single test file with `npm run test -- <path>`. Typecheck with `npm run typecheck`.

---

### Task 1: Migration — `user_modules` table, RLS, triggers, grants

**Files:**
- Create: `supabase/migrations/<timestamp>_add_user_modules.sql` (generate the timestamped filename with `supabase migration new add_user_modules`, then paste the SQL below)
- Modify (regenerate): `src/core/supabase/types.ts`

**Interfaces:**
- Produces (DB): table `public.user_modules` with columns `id, user_id, kindergarten_id, module_key, granted_by, granted_at, created_at, updated_at, created_by, updated_by, deleted_at`; `module_key IN ('pool','payroll_own','payroll_all')`; partial unique on `(user_id, kindergarten_id, module_key) WHERE deleted_at IS NULL`.
- Produces (types): `Database['public']['Tables']['user_modules']['Row' | 'Insert' | 'Update']`.

- [ ] **Step 1: Generate the migration file**

Run: `supabase migration new add_user_modules`
Expected: prints `Created new migration at supabase/migrations/<timestamp>_add_user_modules.sql`.

- [ ] **Step 2: Write the migration SQL**

Paste into the generated file:

```sql
-- user_modules — per-educator, per-kindergarten opt-in module grants.
-- No row = no access. Admin/Super Admin bypass this table (role-based).
create table public.user_modules (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.users(id) on delete cascade,
  kindergarten_id uuid        not null references public.kindergartens(id),
  module_key      text        not null check (module_key in ('pool','payroll_own','payroll_all')),
  granted_by      uuid        not null references public.users(id),
  granted_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        references public.users(id),
  updated_by      uuid        references public.users(id),
  deleted_at      timestamptz
);

-- At most one live grant of a given key per (user, kindergarten).
create unique index user_modules_unique_live
  on public.user_modules (user_id, kindergarten_id, module_key)
  where deleted_at is null;

create index user_modules_user_kg on public.user_modules (user_id, kindergarten_id);
create index user_modules_kg      on public.user_modules (kindergarten_id);

alter table public.user_modules enable row level security;

create trigger trg_user_modules_set_updated_at
  before update on public.user_modules
  for each row execute function public.set_updated_at();

create trigger trg_user_modules_audit_columns
  before insert or update on public.user_modules
  for each row execute function public.set_audit_columns();

create trigger audit_user_modules
  after insert or update or delete on public.user_modules
  for each row execute function public.write_audit_log();

-- READ: super admin; the grantee (own rows, so their sidebar resolves);
-- admins of the kindergarten (to manage). Live rows only.
create policy "user_modules: read"
  on public.user_modules for select to authenticated
  using (
    (
      (select public.is_super_admin())
      or user_id = auth.uid()
      or (
        (select public.current_user_role()) = 'admin'
        and kindergarten_id in (select public.user_kindergarten_ids())
      )
    )
    and deleted_at is null
  );

-- INSERT: super admin, or an admin of that kindergarten. Never the educator
-- themselves — prevents self-escalation.
create policy "user_modules: insert"
  on public.user_modules for insert to authenticated
  with check (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

-- UPDATE: same authority (covers soft-delete/revoke, which is an update of deleted_at).
create policy "user_modules: update"
  on public.user_modules for update to authenticated
  using (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) = 'admin'
      and kindergarten_id in (select public.user_kindergarten_ids())
    )
  );

-- No DELETE grant: revoke is a soft delete (update of deleted_at).
grant select, insert, update on public.user_modules to authenticated;
```

- [ ] **Step 3: Apply the migration to the local stack**

Run: `supabase db reset`
Expected: migrations run without error; final line reports the seed applied (or "Finished supabase db reset").

- [ ] **Step 4: Regenerate types and confirm the table is present**

Run: `supabase gen types typescript --local > src/core/supabase/types.ts`
Then: `grep -n "user_modules" src/core/supabase/types.ts`
Expected: matches showing a `user_modules: {` block with `Row`, `Insert`, `Update`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: passes (the new table type compiles).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations src/core/supabase/types.ts
git commit -m "feat(db): add user_modules table for per-kindergarten module grants"
```

---

### Task 2: Auth module — grant types + claims loader service

**Files:**
- Create: `src/modules/auth/types/moduleAccess.types.ts`
- Create: `src/modules/auth/services/moduleAccess.service.ts`
- Test: `src/modules/auth/services/moduleAccess.service.test.ts`

**Interfaces:**
- Consumes: `Database` from `~/core/supabase/types` (Task 1), `Result` from `~/shared/types/result`.
- Produces:
  - `type ModuleKey = 'pool' | 'payroll_own' | 'payroll_all'`
  - `interface ModuleGrant { kindergartenId: string; moduleKey: ModuleKey }`
  - `listUserModuleGrants(client: SupabaseClient<Database>, userId: string): Promise<Result<ModuleGrant[]>>`

- [ ] **Step 1: Write the types file**

Create `src/modules/auth/types/moduleAccess.types.ts`:

```ts
export type ModuleKey = 'pool' | 'payroll_own' | 'payroll_all'

export interface ModuleGrant {
  kindergartenId: string
  moduleKey: ModuleKey
}
```

- [ ] **Step 2: Write the failing test**

Create `src/modules/auth/services/moduleAccess.service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { listUserModuleGrants } from './moduleAccess.service'

function createMockClient(opts: {
  rows?: Array<{ kindergarten_id: string; module_key: string }> | null
  error?: { message: string } | null
} = {}) {
  const { rows = [], error = null } = opts
  const mockIs = vi.fn().mockResolvedValue({ data: rows, error })
  const mockEq = vi.fn().mockReturnValue({ is: mockIs })
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
  return {
    from: vi.fn().mockReturnValue({ select: mockSelect }),
    _mocks: { mockIs, mockEq, mockSelect },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('listUserModuleGrants', () => {
  it('maps rows to camelCase ModuleGrant and filters live rows for the user', async () => {
    const client = createMockClient({
      rows: [
        { kindergarten_id: 'kg-1', module_key: 'pool' },
        { kindergarten_id: 'kg-2', module_key: 'payroll_own' },
      ],
    })
    const result = await listUserModuleGrants(client, 'user-9')

    expect(result).toEqual({
      success: true,
      data: [
        { kindergartenId: 'kg-1', moduleKey: 'pool' },
        { kindergartenId: 'kg-2', moduleKey: 'payroll_own' },
      ],
    })
    expect(client.from).toHaveBeenCalledWith('user_modules')
    expect(client._mocks.mockEq).toHaveBeenCalledWith('user_id', 'user-9')
    expect(client._mocks.mockIs).toHaveBeenCalledWith('deleted_at', null)
  })

  it('returns an empty array when the user has no grants', async () => {
    const client = createMockClient({ rows: [] })
    const result = await listUserModuleGrants(client, 'user-9')
    expect(result).toEqual({ success: true, data: [] })
  })

  it('returns failure when the query errors', async () => {
    const client = createMockClient({ rows: null, error: { message: 'db error' } })
    const result = await listUserModuleGrants(client, 'user-9')
    expect(result).toEqual({ success: false, error: 'db error' })
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/modules/auth/services/moduleAccess.service.test.ts`
Expected: FAIL — cannot find module `./moduleAccess.service`.

- [ ] **Step 4: Write the service**

Create `src/modules/auth/services/moduleAccess.service.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { ModuleGrant, ModuleKey } from '../types/moduleAccess.types'

type Client = SupabaseClient<Database>

export async function listUserModuleGrants(
  client: Client,
  userId: string,
): Promise<Result<ModuleGrant[]>> {
  const { data, error } = await client
    .from('user_modules')
    .select('kindergarten_id, module_key')
    .eq('user_id', userId)
    .is('deleted_at', null)

  if (error || !data) return { success: false, error: error?.message ?? 'list_failed' }
  return {
    success: true,
    data: data.map((row) => ({
      kindergartenId: row.kindergarten_id,
      moduleKey: row.module_key as ModuleKey,
    })),
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- src/modules/auth/services/moduleAccess.service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/modules/auth/types/moduleAccess.types.ts src/modules/auth/services/moduleAccess.service.ts src/modules/auth/services/moduleAccess.service.test.ts
git commit -m "feat(auth): add module-grant types and claims loader service"
```

---

### Task 3: Auth store — module-grants claims cache

**Files:**
- Modify: `src/modules/auth/stores/auth.store.ts`
- Test: `src/modules/auth/stores/auth.store.test.ts` (add cases)

**Interfaces:**
- Consumes: `listUserModuleGrants` (Task 2), `ModuleGrant` (Task 2).
- Produces: `authStore.moduleGrants: ModuleGrant[]` — populated in `login()` and `fetchCurrentUser()`, cleared in `logout()`.

- [ ] **Step 1: Write the failing test**

Add to `src/modules/auth/stores/auth.store.test.ts` a describe block. Mock the grants service so the store loads a cache:

```ts
import { listUserModuleGrants } from '../services/moduleAccess.service'

vi.mock('../services/moduleAccess.service', () => ({
  listUserModuleGrants: vi.fn(),
}))

describe('auth.store module grants cache', () => {
  it('populates moduleGrants after a successful login and clears on logout', async () => {
    // Arrange existing login mocks so login() succeeds (mirror the existing
    // successful-login test in this file for signIn + fetchCurrentUserProfile),
    // then:
    vi.mocked(listUserModuleGrants).mockResolvedValue({
      success: true,
      data: [{ kindergartenId: 'kg-1', moduleKey: 'pool' }],
    })

    const store = useAuthStore()
    await store.login('a@b.com', 'pw')

    expect(store.moduleGrants).toEqual([{ kindergartenId: 'kg-1', moduleKey: 'pool' }])

    await store.logout()
    expect(store.moduleGrants).toEqual([])
  })
})
```

> Note for the implementer: this file already mocks `auth.service`; reuse those mocks so `login()` reaches the profile step. If wiring the full login mock is noisy, instead test the smaller seam directly: call a new `store.loadModuleGrants('user-1')` action and assert `store.moduleGrants`, plus assert `logout()` clears it. Either is acceptable; keep it deterministic.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/modules/auth/stores/auth.store.test.ts`
Expected: FAIL — `moduleGrants` is undefined / `loadModuleGrants` not a function.

- [ ] **Step 3: Implement the cache in the store**

In `src/modules/auth/stores/auth.store.ts`:

Add imports near the top:

```ts
import { listUserModuleGrants } from '../services/moduleAccess.service'
import type { ModuleGrant } from '../types/moduleAccess.types'
```

Add to `state`:

```ts
    moduleGrants: [] as ModuleGrant[],
```

Add an action (place it among the other actions):

```ts
    async loadModuleGrants(userId: string) {
      const client = useSupabaseClient()
      const result = await listUserModuleGrants(client, userId)
      this.moduleGrants = result.success ? result.data : []
    },
```

In `login()`, right after `this.user = toAuthUser(profileResult.data)` and before `return true`:

```ts
      await this.loadModuleGrants(profileResult.data.id)
```

In `fetchCurrentUser()`, right after `this.user = toAuthUser(profileResult.data)`:

```ts
      await this.loadModuleGrants(profileResult.data.id)
```

In `logout()`, after `this.user = null`:

```ts
      this.moduleGrants = []
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/modules/auth/stores/auth.store.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/modules/auth/stores/auth.store.ts src/modules/auth/stores/auth.store.test.ts
git commit -m "feat(auth): cache module grants in auth store on login"
```

---

### Task 4: Permissions — `view` action, `pool`/`payroll` resources, `payrollScope`

**Files:**
- Modify: `src/modules/auth/composables/usePermissions.ts`
- Test: `src/modules/auth/composables/usePermissions.test.ts` (add cases)

**Interfaces:**
- Consumes: `authStore.moduleGrants` (Task 3), `ModuleKey` (Task 2).
- Produces:
  - `PermissionAction` now includes `'view'`; `PermissionResource` now includes `'pool' | 'payroll'`.
  - `usePermissions()` returns `{ can, payrollScope }` where `payrollScope(kindergartenId?: string): 'all' | 'own' | null`.

- [ ] **Step 1: Write the failing tests**

Add to `src/modules/auth/composables/usePermissions.test.ts`. First extend the helper to also set grants:

```ts
import type { ModuleGrant } from '~/modules/auth/types/moduleAccess.types'

function setUser(role: 'super_admin' | 'admin' | 'educator', grants: ModuleGrant[] = []) {
  const authStore = useAuthStore()
  authStore.user = { id: 'user-1', email: 'a@b.com', fullName: 'A B', role, avatarUrl: null, status: 'active' }
  authStore.moduleGrants = grants
}

describe('usePermissions — pool/payroll', () => {
  it('admin and super_admin can view pool regardless of grants', () => {
    setUser('admin')
    expect(usePermissions().can('view', 'pool', 'kg-1')).toBe(true)
    setUser('super_admin')
    expect(usePermissions().can('view', 'pool', 'kg-1')).toBe(true)
  })

  it('educator can view pool only for a kindergarten they hold a pool grant in', () => {
    setUser('educator', [{ kindergartenId: 'kg-1', moduleKey: 'pool' }])
    const { can } = usePermissions()
    expect(can('view', 'pool', 'kg-1')).toBe(true)
    expect(can('view', 'pool', 'kg-2')).toBe(false)
  })

  it('educator with no grants cannot view pool or payroll', () => {
    setUser('educator', [])
    const { can } = usePermissions()
    expect(can('view', 'pool', 'kg-1')).toBe(false)
    expect(can('view', 'payroll', 'kg-1')).toBe(false)
  })

  it('payrollScope returns all for admin/super_admin', () => {
    setUser('admin')
    expect(usePermissions().payrollScope('kg-1')).toBe('all')
    setUser('super_admin')
    expect(usePermissions().payrollScope('kg-1')).toBe('all')
  })

  it('payrollScope reflects the educator grant key', () => {
    setUser('educator', [{ kindergartenId: 'kg-1', moduleKey: 'payroll_own' }])
    expect(usePermissions().payrollScope('kg-1')).toBe('own')
    setUser('educator', [{ kindergartenId: 'kg-1', moduleKey: 'payroll_all' }])
    expect(usePermissions().payrollScope('kg-1')).toBe('all')
    setUser('educator', [])
    expect(usePermissions().payrollScope('kg-1')).toBe(null)
  })

  it('can(view, payroll) is true exactly when payrollScope is non-null', () => {
    setUser('educator', [{ kindergartenId: 'kg-1', moduleKey: 'payroll_all' }])
    expect(usePermissions().can('view', 'payroll', 'kg-1')).toBe(true)
    expect(usePermissions().can('view', 'payroll', 'kg-2')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/modules/auth/composables/usePermissions.test.ts`
Expected: FAIL — `payrollScope` not returned / `'pool'` not handled.

- [ ] **Step 3: Extend the composable**

Rewrite `src/modules/auth/composables/usePermissions.ts`:

```ts
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import type { ModuleKey } from '~/modules/auth/types/moduleAccess.types'

export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'assign-role' | 'view'
export type PermissionResource = 'kindergarten' | 'staff' | 'children' | 'groups' | 'settings' | 'pool' | 'payroll'

export function usePermissions() {
  const authStore = useAuthStore()

  // True when the user holds a live grant for one of `keys`. A specific
  // kindergarten id restricts to that kindergarten; 'ALL'/undefined matches any.
  function hasGrant(kindergartenId: string | undefined, keys: ModuleKey[]): boolean {
    const grants = authStore.moduleGrants
    if (kindergartenId && kindergartenId !== 'ALL') {
      return grants.some((g) => g.kindergartenId === kindergartenId && keys.includes(g.moduleKey))
    }
    return grants.some((g) => keys.includes(g.moduleKey))
  }

  function payrollScope(kindergartenId?: string): 'all' | 'own' | null {
    const role = authStore.user?.role
    if (!role) return null
    if (role === 'super_admin' || role === 'admin') return 'all'
    if (hasGrant(kindergartenId, ['payroll_all'])) return 'all'
    if (hasGrant(kindergartenId, ['payroll_own'])) return 'own'
    return null
  }

  function can(action: PermissionAction, resource: PermissionResource, target?: unknown): boolean {
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
      return true // all authenticated users
    }

    if (resource === 'pool') {
      if (role === 'super_admin' || role === 'admin') return true
      return hasGrant(target as string | undefined, ['pool'])
    }

    if (resource === 'payroll') {
      return payrollScope(target as string | undefined) !== null
    }

    return false
  }

  return { can, payrollScope }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/modules/auth/composables/usePermissions.test.ts`
Expected: PASS (existing + new cases).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/modules/auth/composables/usePermissions.ts src/modules/auth/composables/usePermissions.test.ts
git commit -m "feat(auth): extend can() with pool/payroll view and payrollScope"
```

---

### Task 5: Dynamic sidebar entries + route stubs

**Files:**
- Modify: `src/layouts/admin.vue:35-41` (the `navItems` computed)
- Create: `src/pages/pool.vue`
- Create: `src/pages/payroll.vue`
- Modify: `src/core/i18n/locales/ro.json` (`nav` block)
- Modify: `src/core/i18n/locales/en.json` (`nav` block)

**Interfaces:**
- Consumes: `can('view', 'pool' | 'payroll', kgId)` (Task 4), `tenantStore.selectedKindergartenId`.
- Produces: sidebar links to `/pool` and `/payroll` that appear per grant; placeholder pages at those routes.

- [ ] **Step 1: Add i18n keys**

In `src/core/i18n/locales/ro.json`, add to the `nav` object:

```json
    "pool": "Bazin",
    "payroll": "Salarii",
```

Also add a top-level `pool` and `payroll` block (used by the stub pages):

```json
  "pool": { "title": "Bazin", "comingSoon": "Modulul Bazin va fi disponibil în curând." },
  "payroll": { "title": "Salarii", "comingSoon": "Modulul Salarii va fi disponibil în curând." },
```

In `src/core/i18n/locales/en.json`, mirror:

```json
    "pool": "Pool",
    "payroll": "Payroll",
```
```json
  "pool": { "title": "Pool", "comingSoon": "The Pool module is coming soon." },
  "payroll": { "title": "Payroll", "comingSoon": "The Payroll module is coming soon." },
```

- [ ] **Step 2: Add the sidebar entries**

In `src/layouts/admin.vue`, extend the `navItems` computed (after the `children` entry). `tenantStore` is already in scope (`admin.vue:7`):

```ts
const navItems = computed(() => [
  { label: t('nav.overview'),      to: '/',               icon: 'i-heroicons-squares-2x2',      enabled: true },
  { label: t('nav.kindergartens'), to: '/kindergartens',  icon: 'i-heroicons-building-office-2', enabled: can('read', 'kindergarten') },
  { label: t('nav.staff'),         to: '/staff',          icon: 'i-heroicons-user-group',        enabled: can('read', 'staff') },
  { label: t('nav.groups'),        to: '/groups',         icon: 'i-heroicons-users',             enabled: can('read', 'groups') },
  { label: t('nav.children'),      to: '/children',       icon: 'i-heroicons-academic-cap',      enabled: can('read', 'children') },
  { label: t('nav.pool'),          to: '/pool',           icon: 'i-heroicons-lifebuoy',          enabled: can('view', 'pool', tenantStore.selectedKindergartenId) },
  { label: t('nav.payroll'),       to: '/payroll',        icon: 'i-heroicons-banknotes',         enabled: can('view', 'payroll', tenantStore.selectedKindergartenId) },
])
```

> The computed already re-evaluates when `authStore.moduleGrants` or `tenantStore.selectedKindergartenId` change, because `can()` reads them reactively.

- [ ] **Step 3: Create the stub pages**

Create `src/pages/pool.vue` (normal authenticated pages in this app use only `layout: 'admin'` — auth is enforced by global middleware, and module visibility is handled by the sidebar; page-level module guards land with the real screens in B/C):

```vue
<script setup lang="ts">
const { t } = useI18n()
definePageMeta({ layout: 'admin' })
</script>

<template>
  <div class="space-y-4">
    <BasePageHeader :title="t('pool.title')" />
    <p class="text-sm text-slate-400">{{ t('pool.comingSoon') }}</p>
  </div>
</template>
```

Create `src/pages/payroll.vue`:

```vue
<script setup lang="ts">
const { t } = useI18n()
definePageMeta({ layout: 'admin' })
</script>

<template>
  <div class="space-y-4">
    <BasePageHeader :title="t('payroll.title')" />
    <p class="text-sm text-slate-400">{{ t('payroll.comingSoon') }}</p>
  </div>
</template>
```

> Data-level access is enforced by RLS in sub-projects B/C; these stubs only need the sidebar link to resolve. Page-level module guards land with the real screens.

- [ ] **Step 4: Verify the app builds and links render**

Run: `npm run typecheck`
Expected: passes.
Then run `npm run dev`, log in as super_admin, confirm **Bazin** and **Salarii** show in the sidebar and open placeholder pages. (Educator visibility is verified end-to-end in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add src/layouts/admin.vue src/pages/pool.vue src/pages/payroll.vue src/core/i18n/locales/ro.json src/core/i18n/locales/en.json
git commit -m "feat(nav): dynamic Pool/Payroll sidebar entries with route stubs"
```

---

### Task 6: Staff service — grant management + assigned kindergartens

**Files:**
- Modify: `src/modules/staff/services/staff.service.ts`
- Test: `src/modules/staff/services/staff.service.test.ts` (add cases)

**Interfaces:**
- Consumes: `Database` types (Task 1), `Result`.
- Produces (all standalone exports, `client` first):
  - `type UserModuleRow = Database['public']['Tables']['user_modules']['Row']`
  - `listUserModules(client, userId: string, kindergartenId: string): Promise<Result<UserModuleRow[]>>`
  - `grantModule(client, userId: string, kindergartenId: string, moduleKey: ModuleKey, actorId: string): Promise<Result<UserModuleRow>>`
  - `revokeModule(client, userId: string, kindergartenId: string, moduleKey: ModuleKey): Promise<Result<null>>`
  - `listAssignedKindergartens(client, userId: string): Promise<Result<Array<{ id: string; name: string }>>>`

- [ ] **Step 1: Write the failing tests**

Add to `src/modules/staff/services/staff.service.test.ts`:

```ts
import { listUserModules, grantModule, revokeModule, listAssignedKindergartens } from './staff.service'

const moduleRow = {
  id: 'um-1',
  user_id: 'user-2',
  kindergarten_id: 'kg-1',
  module_key: 'pool' as const,
  granted_by: 'user-1',
  granted_at: '2026-07-02T00:00:00Z',
  created_at: '2026-07-02T00:00:00Z',
  updated_at: '2026-07-02T00:00:00Z',
  created_by: 'user-1',
  updated_by: 'user-1',
  deleted_at: null,
}

describe('listUserModules', () => {
  it('returns live module rows for a user in a kindergarten', async () => {
    const mockIs = vi.fn().mockResolvedValue({ data: [moduleRow], error: null })
    const mockEq2 = vi.fn().mockReturnValue({ is: mockIs })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const client = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEq1 }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await listUserModules(client, 'user-2', 'kg-1')
    expect(result).toEqual({ success: true, data: [moduleRow] })
    expect(client.from).toHaveBeenCalledWith('user_modules')
    expect(mockEq1).toHaveBeenCalledWith('user_id', 'user-2')
    expect(mockEq2).toHaveBeenCalledWith('kindergarten_id', 'kg-1')
    expect(mockIs).toHaveBeenCalledWith('deleted_at', null)
  })
})

describe('grantModule', () => {
  it('inserts a grant row with granted_by set to the actor', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: moduleRow, error: null })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
    const client = { from: vi.fn().mockReturnValue({ insert: mockInsert }) } as any // eslint-disable-line @typescript-eslint/no-explicit-any

    const result = await grantModule(client, 'user-2', 'kg-1', 'pool', 'user-1')
    expect(result).toEqual({ success: true, data: moduleRow })
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-2',
      kindergarten_id: 'kg-1',
      module_key: 'pool',
      granted_by: 'user-1',
    })
  })
})

describe('revokeModule', () => {
  it('soft-deletes the live grant row matching user, kindergarten and key', async () => {
    const mockIs = vi.fn().mockResolvedValue({ error: null })
    const mockEq3 = vi.fn().mockReturnValue({ is: mockIs })
    const mockEq2 = vi.fn().mockReturnValue({ eq: mockEq3 })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    const client = { from: vi.fn().mockReturnValue({ update: mockUpdate }) } as any // eslint-disable-line @typescript-eslint/no-explicit-any

    const result = await revokeModule(client, 'user-2', 'kg-1', 'pool')
    expect(result).toEqual({ success: true, data: null })
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }))
    expect(mockEq1).toHaveBeenCalledWith('user_id', 'user-2')
    expect(mockEq2).toHaveBeenCalledWith('kindergarten_id', 'kg-1')
    expect(mockEq3).toHaveBeenCalledWith('module_key', 'pool')
    expect(mockIs).toHaveBeenCalledWith('deleted_at', null)
  })
})

describe('listAssignedKindergartens', () => {
  it('maps the joined kindergarten rows to {id, name}', async () => {
    const mockEq = vi.fn().mockResolvedValue({
      data: [{ kindergarten_id: 'kg-1', kindergartens: { id: 'kg-1', name: 'Sunflower' } }],
      error: null,
    })
    const client = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEq }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await listAssignedKindergartens(client, 'user-2')
    expect(result).toEqual({ success: true, data: [{ id: 'kg-1', name: 'Sunflower' }] })
    expect(client.from).toHaveBeenCalledWith('user_kindergartens')
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-2')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/modules/staff/services/staff.service.test.ts`
Expected: FAIL — the four new functions are not exported.

- [ ] **Step 3: Implement the service functions**

Append to `src/modules/staff/services/staff.service.ts` (add the `ModuleKey` import at the top):

```ts
import type { ModuleKey } from '~/modules/auth/types/moduleAccess.types'
```

> `ModuleKey` is a pure type; importing a `type` from another module for a shared vocabulary does not violate the runtime module-decoupling rule (no code or store is imported).

```ts
export type UserModuleRow = Database['public']['Tables']['user_modules']['Row']

export async function listUserModules(
  client: Client,
  userId: string,
  kindergartenId: string,
): Promise<Result<UserModuleRow[]>> {
  const { data, error } = await client
    .from('user_modules')
    .select('*')
    .eq('user_id', userId)
    .eq('kindergarten_id', kindergartenId)
    .is('deleted_at', null)

  if (error || !data) return { success: false, error: error?.message ?? 'list_failed' }
  return { success: true, data }
}

export async function grantModule(
  client: Client,
  userId: string,
  kindergartenId: string,
  moduleKey: ModuleKey,
  actorId: string,
): Promise<Result<UserModuleRow>> {
  const { data, error } = await client
    .from('user_modules')
    .insert({
      user_id: userId,
      kindergarten_id: kindergartenId,
      module_key: moduleKey,
      granted_by: actorId,
    })
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'grant_failed' }
  return { success: true, data }
}

export async function revokeModule(
  client: Client,
  userId: string,
  kindergartenId: string,
  moduleKey: ModuleKey,
): Promise<Result<null>> {
  const { error } = await client
    .from('user_modules')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('kindergarten_id', kindergartenId)
    .eq('module_key', moduleKey)
    .is('deleted_at', null)

  if (error) return { success: false, error: error.message }
  return { success: true, data: null }
}

export async function listAssignedKindergartens(
  client: Client,
  userId: string,
): Promise<Result<Array<{ id: string; name: string }>>> {
  const { data, error } = await client
    .from('user_kindergartens')
    .select('kindergarten_id, kindergartens!inner(id, name)')
    .eq('user_id', userId)

  if (error || !data) return { success: false, error: error?.message ?? 'list_failed' }
  return {
    success: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data.map((row: any) => ({ id: row.kindergartens.id, name: row.kindergartens.name })),
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/modules/staff/services/staff.service.test.ts`
Expected: PASS (existing + 4 new cases).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/modules/staff/services/staff.service.ts src/modules/staff/services/staff.service.test.ts
git commit -m "feat(staff): add module grant/revoke and assigned-kindergartens queries"
```

---

### Task 7: Staff store — module-assignment actions

**Files:**
- Modify: `src/modules/staff/stores/staff.store.ts`
- Test: `src/modules/staff/stores/staff.store.test.ts` (add cases)

**Interfaces:**
- Consumes: `listUserModules`, `grantModule`, `revokeModule`, `listAssignedKindergartens` (Task 6), `useAuthStore().user.id` for the actor.
- Produces store actions:
  - `fetchAssignedKindergartens(userId): Promise<Array<{ id: string; name: string }>>`
  - `fetchUserModules(userId, kindergartenId): Promise<ModuleKey[]>` — returns the live module keys.
  - `saveModuleGrants(userId, kindergartenId, desiredKeys: ModuleKey[]): Promise<boolean>` — diffs against current and calls grant/revoke.

- [ ] **Step 1: Write the failing test**

Add to `src/modules/staff/stores/staff.store.test.ts`. Mock the service module methods:

```ts
import * as staffService from '../services/staff.service'

describe('staff.store module grants', () => {
  it('saveModuleGrants grants missing keys and revokes removed keys', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'actor-1', email: 'a@b.com', fullName: 'A', role: 'admin', avatarUrl: null, status: 'active' }

    vi.spyOn(staffService, 'listUserModules').mockResolvedValue({
      success: true,
      data: [
        { module_key: 'pool' } as any,          // currently: pool
        { module_key: 'payroll_own' } as any,   // currently: payroll_own
      ],
    })
    const grantSpy = vi.spyOn(staffService, 'grantModule').mockResolvedValue({ success: true, data: {} as any })
    const revokeSpy = vi.spyOn(staffService, 'revokeModule').mockResolvedValue({ success: true, data: null })

    const store = useStaffStore()
    // desired: pool + payroll_all  → add payroll_all, remove payroll_own
    const ok = await store.saveModuleGrants('user-2', 'kg-1', ['pool', 'payroll_all'])

    expect(ok).toBe(true)
    expect(grantSpy).toHaveBeenCalledWith(expect.anything(), 'user-2', 'kg-1', 'payroll_all', 'actor-1')
    expect(revokeSpy).toHaveBeenCalledWith(expect.anything(), 'user-2', 'kg-1', 'payroll_own')
    expect(grantSpy).not.toHaveBeenCalledWith(expect.anything(), 'user-2', 'kg-1', 'pool', 'actor-1')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/modules/staff/stores/staff.store.test.ts`
Expected: FAIL — `saveModuleGrants` is not a function.

- [ ] **Step 3: Implement the actions**

In `src/modules/staff/stores/staff.store.ts`, add the import:

```ts
import type { ModuleKey } from '~/modules/auth/types/moduleAccess.types'
```

Add these actions inside the `actions` object:

```ts
    async fetchAssignedKindergartens(userId: string) {
      const client = useSupabaseClient()
      const result = await staffService.listAssignedKindergartens(client, userId)
      return result.success ? result.data : []
    },

    async fetchUserModules(userId: string, kindergartenId: string): Promise<ModuleKey[]> {
      const client = useSupabaseClient()
      const result = await staffService.listUserModules(client, userId, kindergartenId)
      if (!result.success) return []
      return result.data.map((row) => row.module_key as ModuleKey)
    },

    async saveModuleGrants(userId: string, kindergartenId: string, desiredKeys: ModuleKey[]): Promise<boolean> {
      const authStore = useAuthStore()
      const actorId = authStore.user?.id
      if (!actorId) return false

      const client = useSupabaseClient()
      this.loading = true
      this.error = null

      const currentResult = await staffService.listUserModules(client, userId, kindergartenId)
      if (!currentResult.success) {
        this.loading = false
        this.error = currentResult.error
        return false
      }
      const current = currentResult.data.map((row) => row.module_key as ModuleKey)

      const toAdd = desiredKeys.filter((k) => !current.includes(k))
      const toRemove = current.filter((k) => !desiredKeys.includes(k))

      for (const key of toAdd) {
        const r = await staffService.grantModule(client, userId, kindergartenId, key, actorId)
        if (!r.success) { this.loading = false; this.error = r.error; return false }
      }
      for (const key of toRemove) {
        const r = await staffService.revokeModule(client, userId, kindergartenId, key)
        if (!r.success) { this.loading = false; this.error = r.error; return false }
      }

      this.loading = false
      return true
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/modules/staff/stores/staff.store.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/modules/staff/stores/staff.store.ts src/modules/staff/stores/staff.store.test.ts
git commit -m "feat(staff): store actions to load and diff-save module grants"
```

---

### Task 8: ModuleAssignmentPanel drawer + wire into staff list

**Files:**
- Create: `src/modules/staff/components/ModuleAssignmentPanel.vue`
- Modify: `src/modules/staff/pages/StaffListPage.vue` (add a row action + the drawer)
- Modify: `src/core/i18n/locales/ro.json` (`staff` block)
- Modify: `src/core/i18n/locales/en.json` (`staff` block)

**Interfaces:**
- Consumes: `useStaffStore().fetchAssignedKindergartens / fetchUserModules / saveModuleGrants` (Task 7), `usePermissions().can` (Task 4), `StaffMember` type.
- Produces: a drawer, opened from a staff-list row action ("Acces module"), that lets an Admin/Super Admin edit a member's grants per kindergarten.

- [ ] **Step 1: Add i18n keys**

In `src/core/i18n/locales/ro.json`, add to the `staff` object:

```json
    "moduleAccess": "Acces module",
    "moduleAccessTitle": "Acces module — {name}",
    "moduleAccessEmpty": "Acest utilizator nu este asignat la nicio grădiniță.",
    "modulePool": "Bazin",
    "modulePayrollOwn": "Salarii (doar ale lui)",
    "modulePayrollAll": "Salarii (toate)",
    "moduleSaveSuccess": "Accesul la module a fost actualizat.",
```

In `src/core/i18n/locales/en.json`, mirror:

```json
    "moduleAccess": "Module access",
    "moduleAccessTitle": "Module access — {name}",
    "moduleAccessEmpty": "This user is not assigned to any kindergarten.",
    "modulePool": "Pool",
    "modulePayrollOwn": "Payroll (own only)",
    "modulePayrollAll": "Payroll (all)",
    "moduleSaveSuccess": "Module access updated.",
```

- [ ] **Step 2: Create the panel component**

Create `src/modules/staff/components/ModuleAssignmentPanel.vue`:

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ModuleKey } from '~/modules/auth/types/moduleAccess.types'
import type { StaffMember } from '../types/staff.types'

const props = defineProps<{ member: StaffMember }>()
const emit = defineEmits<{ saved: [] }>()

const { t } = useI18n()
const toast = useToast()
const staffStore = useStaffStore()

const loading = ref(false)
const saving = ref(false)
const kindergartens = ref<Array<{ id: string; name: string }>>([])
// desired keys per kindergarten id
const selection = ref<Record<string, ModuleKey[]>>({})

const moduleOptions: Array<{ key: ModuleKey; label: string }> = [
  { key: 'pool',         label: t('staff.modulePool') },
  { key: 'payroll_own',  label: t('staff.modulePayrollOwn') },
  { key: 'payroll_all',  label: t('staff.modulePayrollAll') },
]

async function load() {
  loading.value = true
  kindergartens.value = await staffStore.fetchAssignedKindergartens(props.member.id)
  const next: Record<string, ModuleKey[]> = {}
  for (const kg of kindergartens.value) {
    next[kg.id] = await staffStore.fetchUserModules(props.member.id, kg.id)
  }
  selection.value = next
  loading.value = false
}

function toggle(kgId: string, key: ModuleKey, checked: boolean) {
  const set = new Set(selection.value[kgId] ?? [])
  if (checked) set.add(key)
  else set.delete(key)
  selection.value = { ...selection.value, [kgId]: [...set] }
}

function isChecked(kgId: string, key: ModuleKey): boolean {
  return (selection.value[kgId] ?? []).includes(key)
}

async function save() {
  saving.value = true
  let ok = true
  for (const kg of kindergartens.value) {
    ok = await staffStore.saveModuleGrants(props.member.id, kg.id, selection.value[kg.id] ?? [])
    if (!ok) break
  }
  saving.value = false
  if (ok) {
    toast.add({ title: t('staff.moduleSaveSuccess'), color: 'success' })
    emit('saved')
  }
}

watch(() => props.member.id, load, { immediate: true })
</script>

<template>
  <div class="space-y-6">
    <p v-if="loading" class="text-sm text-slate-400">{{ t('common.loading') }}</p>

    <p v-else-if="kindergartens.length === 0" class="text-sm text-slate-400">
      {{ t('staff.moduleAccessEmpty') }}
    </p>

    <template v-else>
      <section v-for="kg in kindergartens" :key="kg.id" class="space-y-2">
        <h3 class="text-sm font-semibold text-slate-700">{{ kg.name }}</h3>
        <label
          v-for="opt in moduleOptions"
          :key="opt.key"
          class="flex items-center gap-2 text-sm text-slate-600"
        >
          <input
            type="checkbox"
            :checked="isChecked(kg.id, opt.key)"
            @change="(e) => toggle(kg.id, opt.key, (e.target as HTMLInputElement).checked)"
          />
          {{ opt.label }}
        </label>
      </section>

      <div class="flex justify-end">
        <UButton color="primary" :loading="saving" @click="save">{{ t('common.save') }}</UButton>
      </div>
    </template>
  </div>
</template>
```

> `common.loading` and `common.save` already exist in the locale files (used elsewhere). If `common.loading` is missing, add `"loading": "Se încarcă…"` / `"loading": "Loading…"` to the `common` block.

- [ ] **Step 3: Wire the drawer into the staff list**

In `src/modules/staff/pages/StaffListPage.vue`:

Add state near the other modal state (after the remove-confirm block, ~line 151):

```ts
// ── Module access drawer ────────────────────────────────────────────────────
const moduleModalOpen = ref(false)
const moduleTarget = ref<StaffMember | null>(null)

function openModuleAccess(member: StaffMember) {
  moduleTarget.value = member
  moduleModalOpen.value = true
}
```

Add a row-action button in the `actions` column `cell` array (alongside the existing edit/status/remove buttons, only for staff who can be managed). Insert this as the first entry in the `h('div', { class: 'flex gap-1' }, [ ... ])` array:

```ts
        canUpdateStaff.value
          ? h(UButton, { size: 'xs', color: 'neutral', variant: 'ghost', onClick: () => openModuleAccess(row.original) }, () => t('staff.moduleAccess'))
          : null,
```

Add the drawer markup before the closing `</div>` of the template (after the remove `UModal`):

```vue
    <UModal v-model:open="moduleModalOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">
          {{ moduleTarget ? t('staff.moduleAccessTitle', { name: moduleTarget.fullName }) : '' }}
        </h2>
      </template>
      <template #body>
        <ModuleAssignmentPanel
          v-if="moduleTarget"
          :member="moduleTarget"
          @saved="moduleModalOpen = false"
        />
      </template>
    </UModal>
```

Add the import at the top of the `<script setup>` block (with the other imports):

```ts
import ModuleAssignmentPanel from '../components/ModuleAssignmentPanel.vue'
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 5: Full test suite + manual end-to-end verification**

Run: `npm run test`
Expected: all green.

Then `npm run dev` and verify the acceptance criteria manually:
- As **admin**: open Staff → a member row → "Acces module"; the drawer lists the member's kindergarten(s) with three checkboxes each. Grant **Pool** to an educator, save.
- Log in as that **educator** (with no other grants): the sidebar shows **Bazin** but not **Salarii**; a member with no grants sees neither.
- Switch the educator's selected kindergarten (if they belong to more than one) and confirm **Bazin** only appears for the kindergarten where Pool was granted.

- [ ] **Step 6: Commit**

```bash
git add src/modules/staff/components/ModuleAssignmentPanel.vue src/modules/staff/pages/StaffListPage.vue src/core/i18n/locales/ro.json src/core/i18n/locales/en.json
git commit -m "feat(staff): module-assignment drawer on the staff list"
```

---

## Self-Review

**Spec coverage:**
- `user_modules` table + RLS + soft delete → Task 1. ✓
- Educator with no rows sees only Settings + their group/children → Tasks 4, 5 (sidebar hides Pool/Payroll), verified in Task 8 step 5. ✓
- `can('view','pool'/'payroll')` checks cache for educator, bypass for admin/super_admin → Task 4. ✓
- `payroll_own` vs `payroll_all` distinct keys, `payrollScope()` → Task 4. ✓
- Sidebar dynamic per grant per kindergarten → Task 5. ✓
- `ModuleAssignmentPanel` as a drawer, admin-only → Task 8 (row action gated by `canUpdateStaff` = `can('update','staff')`). ✓
- Grants per kindergarten → Tasks 6–8 (per-kindergarten sections). ✓
- Claims cache populated in login/fetchCurrentUser, cleared on logout → Task 3. ✓
- i18n RO+EN, queries scoped kindergarten_id + deleted_at IS NULL → Tasks 1, 5, 6, 8. ✓
- Vitest for can()/payrollScope + grant/revoke → Tasks 4, 6, 7. ✓
- Loading/error/empty on the drawer → Task 8. ✓

**Type consistency:** `ModuleKey` / `ModuleGrant` defined in Task 2, imported unchanged in Tasks 3, 4, 6, 7, 8. `UserModuleRow` defined in Task 6, used in Task 7. `payrollScope` signature `(kindergartenId?: string)` consistent between Tasks 4 and its callers. Service functions all `(client, ...)` first-arg, `Result<T>` return. ✓

**Placeholder scan:** none — every step carries concrete code/SQL/commands.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-02-module-access.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
