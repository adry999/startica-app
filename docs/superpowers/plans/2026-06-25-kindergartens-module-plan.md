# Kindergartens Module + Shared Admin Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Kindergartens management screen (list, create, edit details/settings, suspend/reactivate) for Super Admin, plus the shared admin shell (sidebar + topbar layout), tenant-selection store, and `can()`/`usePermissions` helper that every later module (Staff, Groups, Children, Dashboard) will reuse.

**Architecture:** Same layering as the auth module: `Component → composable (useKindergartens) → Pinia store (kindergartens.store) → service (kindergartens.service) → Supabase`. The service returns raw DB rows wrapped in a shared `Result<T>` type (extracted from the auth module's `AuthResult<T>`); the store maps rows to a camelCase `Kindergarten` shape, mirroring how `auth.store.ts` maps `UserRow` → `AuthUser`. Page-level role gating reuses the existing `role.ts` named middleware (built but never wired to a real page yet). Fine-grained UI gating (show/hide buttons) goes through a new `usePermissions()` composable.

**Tech Stack:** Nuxt UI v3.3.7 (`UTable`, `UModal`, `UBadge`, `USelect`, `UForm`/`UFormField`/`UInput`/`UButton`, `useToast()`), Pinia (already wired), Zod v4, Vitest, Playwright — all already installed, no new dependencies.

## Global Constraints

- `services/*.service.ts` is the only layer that calls `client.from(...)` — stores and components never call Supabase directly (CLAUDE.md, "services/ is the only layer that talks to Supabase").
- Every business write sets `created_by`/`updated_by` explicitly from the current user's id (no DB trigger/default populates these — confirmed by reading `supabase/migrations/20260624152426_initial_schema.sql`).
- Reads filter `deleted_at IS NULL` even though RLS also enforces it (CLAUDE.md, "Every read filters deleted_at IS NULL (in RLS and/or query)").
- No hardcoded user-facing strings — every label/message goes through `useI18n()` and a key in both `ro.json` and `en.json`.
- Modules never import from each other directly; communication is via `shared/` or via another module's Pinia store (CLAUDE.md's explicit carve-out) — `kindergartens.store.ts` is allowed to call `useAuthStore()` for the current user id.
- `kindergartens` has no DELETE RLS policy and no delete UI — suspend (`status = 'suspended'`) is the only "removal" action.
- Playwright config (`playwright.config.ts`) renders the app in `ro-RO` locale — e2e selectors must use the Romanian copy.
- Zod v4 syntax (`z.email()`, not `z.string().email()`) — same as the auth module.
- Don't `git push` as part of any task's commit step — commits stay local until the user asks to push.

---

### Task 1: Extract a shared `Result<T>` type

**Files:**
- Create: `D:\CODE\startica\app\src\shared\types\result.ts`
- Modify: `D:\CODE\startica\app\src\modules\auth\services\auth.service.ts`

**Interfaces:**
- Produces: `Result<T> = { success: true; data: T } | { success: false; error: string }`, used by both `auth.service.ts` (replacing its local `AuthResult<T>`) and the new `kindergartens.service.ts` (Task 5).

This is a pure refactor (no behavior change) — the auth module currently defines this exact shape locally as `AuthResult<T>`. Since a second module now needs the identical shape, extract it once instead of duplicating it.

- [ ] **Step 1: Create the shared type**

Create `D:\CODE\startica\app\src\shared\types\result.ts`:

```ts
export type Result<T> = { success: true; data: T } | { success: false; error: string }
```

- [ ] **Step 2: Point `auth.service.ts` at the shared type**

In `D:\CODE\startica\app\src\modules\auth\services\auth.service.ts`, replace:

```ts
export type AuthResult<T> = { success: true; data: T } | { success: false; error: string }
```

with:

```ts
import type { Result } from '~/shared/types/result'

export type AuthResult<T> = Result<T>
```

(Keep the `AuthResult` name as an alias — nothing needs to change at any call site.)

- [ ] **Step 3: Verify nothing broke**

Run: `cd "D:/CODE/startica/app" && npm run typecheck && npm run test`
Expected: typecheck exits 0; all existing Vitest suites still pass (30 tests, unchanged count — this step adds no new tests since it's a pure type refactor).

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/result.ts src/modules/auth/services/auth.service.ts
git commit -m "refactor: extract shared Result<T> type from AuthResult<T>"
```

---

### Task 2: Kindergarten types + Zod schemas (TDD)

**Files:**
- Create: `D:\CODE\startica\app\src\modules\kindergartens\types\kindergarten.types.ts`
- Create: `D:\CODE\startica\app\src\shared\schemas\kindergarten.schema.ts`
- Create: `D:\CODE\startica\app\src\shared\schemas\kindergarten.schema.test.ts`

**Interfaces:**
- Produces: `Kindergarten` (camelCase app-facing shape), `KindergartenStatus` (`'active' | 'suspended'`, re-exported from the generated DB enum).
- Produces: `kindergartenDetailsSchema` → `KindergartenDetailsInput { name: string; address?: string; city?: string; phone?: string }`.
- Produces: `kindergartenSettingsSchema` → `KindergartenSettingsInput { timezone: string; defaultLocale: 'ro' | 'en'; workingHoursStart: string; workingHoursEnd: string }`.

- [ ] **Step 1: Write the failing schema tests**

Create `D:\CODE\startica\app\src\shared\schemas\kindergarten.schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { kindergartenDetailsSchema, kindergartenSettingsSchema } from './kindergarten.schema'

describe('kindergartenDetailsSchema', () => {
  it('accepts a name with no other fields', () => {
    const result = kindergartenDetailsSchema.safeParse({ name: 'Grădinița Zâna Florilor' })
    expect(result.success).toBe(true)
  })

  it('rejects an empty name', () => {
    const result = kindergartenDetailsSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('accepts optional address/city/phone', () => {
    const result = kindergartenDetailsSchema.safeParse({
      name: 'Grădinița Zâna Florilor',
      address: 'Str. Primăverii nr. 12',
      city: 'Cluj-Napoca',
      phone: '+40 264 123 456',
    })
    expect(result.success).toBe(true)
  })
})

describe('kindergartenSettingsSchema', () => {
  it('accepts a valid settings payload', () => {
    const result = kindergartenSettingsSchema.safeParse({
      timezone: 'Europe/Bucharest',
      defaultLocale: 'ro',
      workingHoursStart: '07:30',
      workingHoursEnd: '18:00',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a locale outside ro/en', () => {
    const result = kindergartenSettingsSchema.safeParse({
      timezone: 'Europe/Bucharest',
      defaultLocale: 'fr',
      workingHoursStart: '07:30',
      workingHoursEnd: '18:00',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed working-hours time', () => {
    const result = kindergartenSettingsSchema.safeParse({
      timezone: 'Europe/Bucharest',
      defaultLocale: 'ro',
      workingHoursStart: '7:30am',
      workingHoursEnd: '18:00',
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/shared/schemas/kindergarten.schema.test.ts`
Expected: FAIL — `Cannot find module './kindergarten.schema'`.

- [ ] **Step 3: Write the schema implementation**

Create `D:\CODE\startica\app\src\shared\schemas\kindergarten.schema.ts`:

```ts
import { z } from 'zod'

export const kindergartenDetailsSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
})

export const kindergartenSettingsSchema = z.object({
  timezone: z.string().min(1),
  defaultLocale: z.enum(['ro', 'en']),
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
})

export type KindergartenDetailsInput = z.infer<typeof kindergartenDetailsSchema>
export type KindergartenSettingsInput = z.infer<typeof kindergartenSettingsSchema>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/shared/schemas/kindergarten.schema.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the kindergarten types (no test needed — type-only file)**

Create `D:\CODE\startica\app\src\modules\kindergartens\types\kindergarten.types.ts`:

```ts
import type { Database } from '~/core/supabase/types'

export type KindergartenStatus = Database['public']['Enums']['kindergarten_status']

export interface KindergartenSettings {
  timezone: string
  defaultLocale: 'ro' | 'en'
  workingHours: { start: string; end: string }
}

export interface Kindergarten {
  id: string
  name: string
  address: string | null
  city: string | null
  phone: string | null
  status: KindergartenStatus
  settings: KindergartenSettings
  createdAt: string
}
```

- [ ] **Step 6: Verify typecheck**

Run: `cd "D:/CODE/startica/app" && npm run typecheck`
Expected: exit code 0.

- [ ] **Step 7: Commit**

```bash
git add src/shared/schemas/kindergarten.schema.ts src/shared/schemas/kindergarten.schema.test.ts src/modules/kindergartens/types/kindergarten.types.ts
git commit -m "feat(kindergartens): add types and Zod schemas (TDD)"
```

---

### Task 3: `usePermissions()` / `can()` helper (TDD)

**Files:**
- Create: `D:\CODE\startica\app\src\shared\composables\usePermissions.ts`
- Create: `D:\CODE\startica\app\src\shared\composables\usePermissions.test.ts`

**Interfaces:**
- Consumes: `useAuthStore()` from `~/modules/auth/stores/auth.store` (already exists — `state.user: AuthUser | null`, `AuthUser.role: 'super_admin' | 'admin' | 'educator' | 'parent' | 'child'`).
- Produces: `usePermissions(): { can(action: PermissionAction, resource: PermissionResource, target?: unknown): boolean }`, where `PermissionAction = 'create' | 'read' | 'update' | 'delete'` and `PermissionResource = 'kindergarten'`. The `target` parameter is accepted (unused by any rule yet) so call sites already match the resource-level shape CLAUDE.md specifies for future roles — no call site will need to change when a resource-aware rule (e.g. "admin can update *their* kindergarten") is added later.

- [ ] **Step 1: Write the failing tests**

Create `D:\CODE\startica\app\src\shared\composables\usePermissions.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import { usePermissions } from './usePermissions'

function setUserRole(role: 'super_admin' | 'admin' | 'educator') {
  const authStore = useAuthStore()
  authStore.user = { id: 'user-1', email: 'a@b.com', fullName: 'A B', role, avatarUrl: null, status: 'active' }
}

describe('usePermissions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('lets a super_admin create, read, update, and delete a kindergarten', () => {
    setUserRole('super_admin')
    const { can } = usePermissions()

    expect(can('create', 'kindergarten')).toBe(true)
    expect(can('read', 'kindergarten')).toBe(true)
    expect(can('update', 'kindergarten')).toBe(true)
    expect(can('delete', 'kindergarten')).toBe(true)
  })

  it('lets an admin read but not create/update/delete a kindergarten', () => {
    setUserRole('admin')
    const { can } = usePermissions()

    expect(can('read', 'kindergarten')).toBe(true)
    expect(can('create', 'kindergarten')).toBe(false)
    expect(can('update', 'kindergarten')).toBe(false)
    expect(can('delete', 'kindergarten')).toBe(false)
  })

  it('denies everything when there is no logged-in user', () => {
    const { can } = usePermissions()

    expect(can('read', 'kindergarten')).toBe(false)
    expect(can('create', 'kindergarten')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/shared/composables/usePermissions.test.ts`
Expected: FAIL — `Cannot find module './usePermissions'`.

- [ ] **Step 3: Write the implementation**

Create `D:\CODE\startica\app\src\shared\composables\usePermissions.ts`:

```ts
import { useAuthStore } from '~/modules/auth/stores/auth.store'

export type PermissionAction = 'create' | 'read' | 'update' | 'delete'
export type PermissionResource = 'kindergarten'

export function usePermissions() {
  const authStore = useAuthStore()

  function can(action: PermissionAction, resource: PermissionResource, _target?: unknown): boolean {
    const role = authStore.user?.role
    if (!role) return false

    if (resource === 'kindergarten') {
      if (action === 'read') return true
      return role === 'super_admin'
    }

    return false
  }

  return { can }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/shared/composables/usePermissions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify typecheck and the full test suite**

Run: `cd "D:/CODE/startica/app" && npm run typecheck && npm run test`
Expected: both exit 0; total test count is now 39 (30 existing + 6 schema from Task 2 + 3 permissions from this task).

- [ ] **Step 6: Commit**

```bash
git add src/shared/composables/usePermissions.ts src/shared/composables/usePermissions.test.ts
git commit -m "feat: add usePermissions()/can() authorization helper (TDD)"
```

---

### Task 4: `useTenantStore` (TDD)

**Files:**
- Create: `D:\CODE\startica\app\src\modules\kindergartens\stores\tenant.store.ts`
- Create: `D:\CODE\startica\app\src\modules\kindergartens\stores\tenant.store.test.ts`

**Interfaces:**
- Consumes: `useAuthStore()` (`state.user.role`; nothing else yet — no module has per-user kindergarten assignments wired up client-side yet, so the "first assigned kindergarten" default falls back to `'ALL'` for everyone until Staff/Groups/Children exist to provide that data).
- Produces: `useTenantStore()` → `{ selectedKindergartenId: string | 'ALL' }` state, `selectKindergarten(id: string | 'ALL')` action. This is consumed by the admin shell's topbar switcher (Task 7) and, in later module plans, by service calls that need to scope queries by `kindergarten_id`.

- [ ] **Step 1: Write the failing tests**

Create `D:\CODE\startica\app\src\modules\kindergartens\stores\tenant.store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTenantStore } from './tenant.store'

describe('useTenantStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults to ALL', () => {
    const store = useTenantStore()
    expect(store.selectedKindergartenId).toBe('ALL')
  })

  it('selectKindergarten updates the selection', () => {
    const store = useTenantStore()
    store.selectKindergarten('11111111-1111-1111-1111-111111111111')
    expect(store.selectedKindergartenId).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('selectKindergarten can switch back to ALL', () => {
    const store = useTenantStore()
    store.selectKindergarten('11111111-1111-1111-1111-111111111111')
    store.selectKindergarten('ALL')
    expect(store.selectedKindergartenId).toBe('ALL')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/modules/kindergartens/stores/tenant.store.test.ts`
Expected: FAIL — `Cannot find module './tenant.store'`.

- [ ] **Step 3: Write the implementation**

Create `D:\CODE\startica\app\src\modules\kindergartens\stores\tenant.store.ts`:

```ts
import { defineStore } from 'pinia'

export const useTenantStore = defineStore('tenant', {
  state: () => ({
    selectedKindergartenId: 'ALL' as string | 'ALL',
  }),

  actions: {
    selectKindergarten(id: string | 'ALL') {
      this.selectedKindergartenId = id
    },
  },
})
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/modules/kindergartens/stores/tenant.store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/kindergartens/stores/tenant.store.ts src/modules/kindergartens/stores/tenant.store.test.ts
git commit -m "feat(kindergartens): add useTenantStore (TDD)"
```

---

### Task 5: `kindergartens.service.ts` (TDD)

**Files:**
- Create: `D:\CODE\startica\app\src\modules\kindergartens\services\kindergartens.service.ts`
- Create: `D:\CODE\startica\app\src\modules\kindergartens\services\kindergartens.service.test.ts`

**Interfaces:**
- Consumes: `Result<T>` (Task 1), generated `Database['public']['Tables']['kindergartens']['Row']` type.
- Produces (all take a `SupabaseClient<Database>` as the first argument, matching `auth.service.ts`'s pattern):
  - `listKindergartens(client): Promise<Result<KindergartenRow[]>>`
  - `createKindergarten(client, details: { name: string; address?: string; city?: string; phone?: string }, actorId: string): Promise<Result<KindergartenRow>>`
  - `updateKindergartenDetails(client, id: string, details: { name: string; address?: string; city?: string; phone?: string }, actorId: string): Promise<Result<KindergartenRow>>`
  - `updateKindergartenSettings(client, id: string, settings: { timezone: string; defaultLocale: 'ro' | 'en'; workingHoursStart: string; workingHoursEnd: string }, actorId: string): Promise<Result<KindergartenRow>>`
  - `setKindergartenStatus(client, id: string, status: KindergartenStatus, actorId: string): Promise<Result<KindergartenRow>>`
  - `type KindergartenRow = Database['public']['Tables']['kindergartens']['Row']` (exported — Task 6's store imports it for the row→`Kindergarten` mapping).

- [ ] **Step 1: Write the failing tests**

Create `D:\CODE\startica\app\src\modules\kindergartens\services\kindergartens.service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import {
  listKindergartens,
  createKindergarten,
  updateKindergartenDetails,
  updateKindergartenSettings,
  setKindergartenStatus,
} from './kindergartens.service'

const sampleRow = {
  id: 'kg-1',
  name: 'Grădinița Zâna Florilor',
  address: 'Str. Primăverii nr. 12',
  city: 'Cluj-Napoca',
  phone: '+40 264 123 456',
  logo_url: null,
  status: 'active',
  settings: { timezone: 'Europe/Bucharest', default_locale: 'ro', working_hours: { start: '07:30', end: '18:00' } },
  created_at: '2026-06-24T00:00:00Z',
  updated_at: '2026-06-24T00:00:00Z',
  created_by: 'user-1',
  updated_by: 'user-1',
  deleted_at: null,
}

function createMockClient(overrides: { from?: Record<string, unknown> } = {}) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [sampleRow], error: null }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: sampleRow, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: sampleRow, error: null }),
          }),
        }),
      }),
      ...overrides.from,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('listKindergartens', () => {
  it('returns the non-deleted rows ordered by name', async () => {
    const client = createMockClient()
    const result = await listKindergartens(client)
    expect(result).toEqual({ success: true, data: [sampleRow] })
    expect(client.from).toHaveBeenCalledWith('kindergartens')
  })

  it('returns failure when Supabase errors', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: 'network error' } }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await listKindergartens(client)
    expect(result).toEqual({ success: false, error: 'network error' })
  })
})

describe('createKindergarten', () => {
  it('inserts with default settings and the actor as created_by/updated_by', async () => {
    const client = createMockClient()
    const result = await createKindergarten(client, { name: 'Grădinița Zâna Florilor' }, 'user-1')

    expect(result).toEqual({ success: true, data: sampleRow })
    const insertCall = client.from.mock.results[0].value.insert as ReturnType<typeof vi.fn>
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Grădinița Zâna Florilor',
        created_by: 'user-1',
        updated_by: 'user-1',
        settings: { timezone: 'Europe/Bucharest', default_locale: 'ro', working_hours: { start: '07:30', end: '18:00' } },
      }),
    )
  })
})

describe('updateKindergartenDetails', () => {
  it('updates the details fields and updated_by', async () => {
    const client = createMockClient()
    const result = await updateKindergartenDetails(client, 'kg-1', { name: 'New Name' }, 'user-2')

    expect(result).toEqual({ success: true, data: sampleRow })
    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name', updated_by: 'user-2' }))
  })
})

describe('updateKindergartenSettings', () => {
  it('writes settings as a single jsonb object', async () => {
    const client = createMockClient()
    const result = await updateKindergartenSettings(
      client,
      'kg-1',
      { timezone: 'Europe/Bucharest', defaultLocale: 'en', workingHoursStart: '08:00', workingHoursEnd: '17:00' },
      'user-2',
    )

    expect(result).toEqual({ success: true, data: sampleRow })
    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: { timezone: 'Europe/Bucharest', default_locale: 'en', working_hours: { start: '08:00', end: '17:00' } },
        updated_by: 'user-2',
      }),
    )
  })
})

describe('setKindergartenStatus', () => {
  it('updates only status and updated_by', async () => {
    const client = createMockClient()
    const result = await setKindergartenStatus(client, 'kg-1', 'suspended', 'user-2')

    expect(result).toEqual({ success: true, data: sampleRow })
    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith({ status: 'suspended', updated_by: 'user-2' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/modules/kindergartens/services/kindergartens.service.test.ts`
Expected: FAIL — `Cannot find module './kindergartens.service'`.

- [ ] **Step 3: Write the service implementation**

Create `D:\CODE\startica\app\src\modules\kindergartens\services\kindergartens.service.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'

type Client = SupabaseClient<Database>
export type KindergartenRow = Database['public']['Tables']['kindergartens']['Row']
type KindergartenStatus = Database['public']['Enums']['kindergarten_status']

interface DetailsInput {
  name: string
  address?: string
  city?: string
  phone?: string
}

interface SettingsInput {
  timezone: string
  defaultLocale: 'ro' | 'en'
  workingHoursStart: string
  workingHoursEnd: string
}

export async function listKindergartens(client: Client): Promise<Result<KindergartenRow[]>> {
  const { data, error } = await client.from('kindergartens').select('*').is('deleted_at', null).order('name')

  if (error || !data) return { success: false, error: error?.message ?? 'list_failed' }
  return { success: true, data }
}

export async function createKindergarten(
  client: Client,
  details: DetailsInput,
  actorId: string,
): Promise<Result<KindergartenRow>> {
  const { data, error } = await client
    .from('kindergartens')
    .insert({
      name: details.name,
      address: details.address ?? null,
      city: details.city ?? null,
      phone: details.phone ?? null,
      settings: {
        timezone: 'Europe/Bucharest',
        default_locale: 'ro',
        working_hours: { start: '07:30', end: '18:00' },
      },
      created_by: actorId,
      updated_by: actorId,
    })
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data }
}

export async function updateKindergartenDetails(
  client: Client,
  id: string,
  details: DetailsInput,
  actorId: string,
): Promise<Result<KindergartenRow>> {
  const { data, error } = await client
    .from('kindergartens')
    .update({
      name: details.name,
      address: details.address ?? null,
      city: details.city ?? null,
      phone: details.phone ?? null,
      updated_by: actorId,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data }
}

export async function updateKindergartenSettings(
  client: Client,
  id: string,
  settings: SettingsInput,
  actorId: string,
): Promise<Result<KindergartenRow>> {
  const { data, error } = await client
    .from('kindergartens')
    .update({
      settings: {
        timezone: settings.timezone,
        default_locale: settings.defaultLocale,
        working_hours: { start: settings.workingHoursStart, end: settings.workingHoursEnd },
      },
      updated_by: actorId,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data }
}

export async function setKindergartenStatus(
  client: Client,
  id: string,
  status: KindergartenStatus,
  actorId: string,
): Promise<Result<KindergartenRow>> {
  const { data, error } = await client
    .from('kindergartens')
    .update({ status, updated_by: actorId })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/modules/kindergartens/services/kindergartens.service.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/kindergartens/services/kindergartens.service.ts src/modules/kindergartens/services/kindergartens.service.test.ts
git commit -m "feat(kindergartens): add kindergartens.service.ts (TDD)"
```

---

### Task 6: `kindergartens.store.ts` + `useKindergartens` composable (TDD)

**Files:**
- Create: `D:\CODE\startica\app\src\modules\kindergartens\stores\kindergartens.store.ts`
- Create: `D:\CODE\startica\app\src\modules\kindergartens\stores\kindergartens.store.test.ts`
- Create: `D:\CODE\startica\app\src\modules\kindergartens\composables\useKindergartens.ts`

**Interfaces:**
- Consumes: every export from `kindergartens.service.ts` (Task 5), `Kindergarten`/`KindergartenStatus` types (Task 2), `useAuthStore()` (for `actorId`), `useSupabaseClient()` from `~/core/supabase/client`.
- Produces: `useKindergartensStore()` → `state: { items: Kindergarten[]; loading: boolean; error: string | null }`, actions `fetchAll()`, `create(details): Promise<boolean>`, `updateDetails(id, details): Promise<boolean>`, `updateSettings(id, settings): Promise<boolean>`, `setStatus(id, status): Promise<boolean>`.
- Produces: `useKindergartens()` composable — same thin-wrapper shape as `useAuth.ts` (computed-wrapped state, bound action functions). This is what `KindergartensListPage.vue` (Task 8) actually calls.

- [ ] **Step 1: Write the failing tests**

Create `D:\CODE\startica\app\src\modules\kindergartens\stores\kindergartens.store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('~/core/supabase/client', () => ({
  useSupabaseClient: () => ({}),
}))

vi.mock('../services/kindergartens.service')

import { useKindergartensStore } from './kindergartens.store'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as kindergartensService from '../services/kindergartens.service'

const sampleRow = {
  id: 'kg-1',
  name: 'Grădinița Zâna Florilor',
  address: null,
  city: null,
  phone: null,
  logo_url: null,
  status: 'active' as const,
  settings: { timezone: 'Europe/Bucharest', default_locale: 'ro', working_hours: { start: '07:30', end: '18:00' } },
  created_at: '2026-06-24T00:00:00Z',
  updated_at: '2026-06-24T00:00:00Z',
  created_by: 'user-1',
  updated_by: 'user-1',
  deleted_at: null,
}

describe('useKindergartensStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    useAuthStore().user = { id: 'user-1', email: 'a@b.com', fullName: 'A B', role: 'super_admin', avatarUrl: null, status: 'active' }
  })

  it('fetchAll loads and maps the list', async () => {
    vi.mocked(kindergartensService.listKindergartens).mockResolvedValue({ success: true, data: [sampleRow] })

    const store = useKindergartensStore()
    await store.fetchAll()

    expect(store.items).toEqual([
      {
        id: 'kg-1',
        name: 'Grădinița Zâna Florilor',
        address: null,
        city: null,
        phone: null,
        status: 'active',
        settings: { timezone: 'Europe/Bucharest', defaultLocale: 'ro', workingHours: { start: '07:30', end: '18:00' } },
        createdAt: '2026-06-24T00:00:00Z',
      },
    ])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('fetchAll captures the error and leaves items empty on failure', async () => {
    vi.mocked(kindergartensService.listKindergartens).mockResolvedValue({ success: false, error: 'boom' })

    const store = useKindergartensStore()
    await store.fetchAll()

    expect(store.items).toEqual([])
    expect(store.error).toBe('boom')
  })

  it('create calls the service with the current user as actor and appends the result', async () => {
    vi.mocked(kindergartensService.createKindergarten).mockResolvedValue({ success: true, data: sampleRow })

    const store = useKindergartensStore()
    const ok = await store.create({ name: 'Grădinița Zâna Florilor' })

    expect(ok).toBe(true)
    expect(kindergartensService.createKindergarten).toHaveBeenCalledWith({}, { name: 'Grădinița Zâna Florilor' }, 'user-1')
    expect(store.items).toHaveLength(1)
  })

  it('setStatus updates the matching item in place', async () => {
    vi.mocked(kindergartensService.listKindergartens).mockResolvedValue({ success: true, data: [sampleRow] })
    vi.mocked(kindergartensService.setKindergartenStatus).mockResolvedValue({
      success: true,
      data: { ...sampleRow, status: 'suspended' },
    })

    const store = useKindergartensStore()
    await store.fetchAll()
    const ok = await store.setStatus('kg-1', 'suspended')

    expect(ok).toBe(true)
    expect(store.items[0].status).toBe('suspended')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/modules/kindergartens/stores/kindergartens.store.test.ts`
Expected: FAIL — `Cannot find module './kindergartens.store'`.

- [ ] **Step 3: Write the store implementation**

Create `D:\CODE\startica\app\src\modules\kindergartens\stores\kindergartens.store.ts`:

```ts
import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as kindergartensService from '../services/kindergartens.service'
import type { KindergartenRow } from '../services/kindergartens.service'
import type { Kindergarten, KindergartenStatus } from '../types/kindergarten.types'

interface DetailsInput {
  name: string
  address?: string
  city?: string
  phone?: string
}

interface SettingsInput {
  timezone: string
  defaultLocale: 'ro' | 'en'
  workingHoursStart: string
  workingHoursEnd: string
}

function toKindergarten(row: KindergartenRow): Kindergarten {
  const settings = row.settings as {
    timezone?: string
    default_locale?: string
    working_hours?: { start?: string; end?: string }
  } | null

  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    phone: row.phone,
    status: row.status,
    settings: {
      timezone: settings?.timezone ?? 'Europe/Bucharest',
      defaultLocale: settings?.default_locale === 'en' ? 'en' : 'ro',
      workingHours: {
        start: settings?.working_hours?.start ?? '07:30',
        end: settings?.working_hours?.end ?? '18:00',
      },
    },
    createdAt: row.created_at,
  }
}

export const useKindergartensStore = defineStore('kindergartens', {
  state: () => ({
    items: [] as Kindergarten[],
    loading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchAll() {
      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await kindergartensService.listKindergartens(client)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        this.items = []
        return
      }

      this.items = result.data.map(toKindergarten)
    },

    async create(details: DetailsInput) {
      const authStore = useAuthStore()
      const actorId = authStore.user?.id
      if (!actorId) return false

      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await kindergartensService.createKindergarten(client, details, actorId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }

      this.items.push(toKindergarten(result.data))
      return true
    },

    async updateDetails(id: string, details: DetailsInput) {
      const authStore = useAuthStore()
      const actorId = authStore.user?.id
      if (!actorId) return false

      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await kindergartensService.updateKindergartenDetails(client, id, details, actorId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }

      this.replaceItem(toKindergarten(result.data))
      return true
    },

    async updateSettings(id: string, settings: SettingsInput) {
      const authStore = useAuthStore()
      const actorId = authStore.user?.id
      if (!actorId) return false

      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await kindergartensService.updateKindergartenSettings(client, id, settings, actorId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }

      this.replaceItem(toKindergarten(result.data))
      return true
    },

    async setStatus(id: string, status: KindergartenStatus) {
      const authStore = useAuthStore()
      const actorId = authStore.user?.id
      if (!actorId) return false

      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await kindergartensService.setKindergartenStatus(client, id, status, actorId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }

      this.replaceItem(toKindergarten(result.data))
      return true
    },

    replaceItem(updated: Kindergarten) {
      const index = this.items.findIndex((item) => item.id === updated.id)
      if (index === -1) return
      this.items[index] = updated
    },
  },
})
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/modules/kindergartens/stores/kindergartens.store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the `useKindergartens` composable (no dedicated test — thin wrapper, covered by the store tests above and by Playwright in Task 10)**

Create `D:\CODE\startica\app\src\modules\kindergartens\composables\useKindergartens.ts`:

```ts
import { computed } from 'vue'
import { useKindergartensStore } from '../stores/kindergartens.store'

export function useKindergartens() {
  const store = useKindergartensStore()

  return {
    items: computed(() => store.items),
    loading: computed(() => store.loading),
    error: computed(() => store.error),
    fetchAll: () => store.fetchAll(),
    create: (details: { name: string; address?: string; city?: string; phone?: string }) => store.create(details),
    updateDetails: (id: string, details: { name: string; address?: string; city?: string; phone?: string }) =>
      store.updateDetails(id, details),
    updateSettings: (
      id: string,
      settings: { timezone: string; defaultLocale: 'ro' | 'en'; workingHoursStart: string; workingHoursEnd: string },
    ) => store.updateSettings(id, settings),
    setStatus: (id: string, status: 'active' | 'suspended') => store.setStatus(id, status),
  }
}
```

- [ ] **Step 6: Verify typecheck and the full test suite**

Run: `cd "D:/CODE/startica/app" && npm run typecheck && npm run test`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/modules/kindergartens/stores/kindergartens.store.ts src/modules/kindergartens/stores/kindergartens.store.test.ts src/modules/kindergartens/composables/useKindergartens.ts
git commit -m "feat(kindergartens): add kindergartens.store.ts + useKindergartens composable (TDD)"
```

---

### Task 7: i18n keys + admin shell layout (sidebar + topbar)

**Files:**
- Modify: `D:\CODE\startica\app\src\core\i18n\locales\ro.json`
- Modify: `D:\CODE\startica\app\src\core\i18n\locales\en.json`
- Create: `D:\CODE\startica\app\src\layouts\admin.vue`
- Modify: `D:\CODE\startica\app\src\pages\index.vue`

**Interfaces:**
- Consumes: `useAuth()` (`user`, `logout`), `useTenantStore()` (Task 4), `LanguageSwitcher.vue` (already exists, used unchanged).
- Produces: `definePageMeta({ layout: 'admin' })` is now available to any authenticated page; `index.vue` is the first consumer and the template all later module pages (Task 9, and Staff/Groups/Children/Dashboard's own pages) will follow.

No unit test for this task — it's Vue template/layout code with no pure logic to isolate; it's exercised end-to-end by Playwright in Task 10.

- [ ] **Step 1: Add the new `nav.*` and `tenant.*` i18n keys to `ro.json`**

In `D:\CODE\startica\app\src\core\i18n\locales\ro.json`, add two new top-level keys (after the existing `"auth"` block, before its closing `}`):

```json
  "nav": {
    "overview": "Prezentare generală",
    "kindergartens": "Grădinițe",
    "staff": "Personal",
    "groups": "Grupe",
    "children": "Copii",
    "comingSoon": "În curând"
  },
  "tenant": {
    "all": "Toate grădinițele"
  }
```

(Insert this as a sibling of `"auth"`, i.e. add a comma after the `"auth"` block's closing `}` and place these two objects after it, before the file's final closing `}`.)

- [ ] **Step 2: Add the matching keys to `en.json`**

In `D:\CODE\startica\app\src\core\i18n\locales\en.json`, add the same structure in the same position:

```json
  "nav": {
    "overview": "Overview",
    "kindergartens": "Kindergartens",
    "staff": "Staff",
    "groups": "Groups",
    "children": "Children",
    "comingSoon": "Coming soon"
  },
  "tenant": {
    "all": "All kindergartens"
  }
```

- [ ] **Step 3: Verify the i18n JSON is still valid**

Run: `cd "D:/CODE/startica/app" && node -e "JSON.parse(require('fs').readFileSync('src/core/i18n/locales/ro.json','utf8')); JSON.parse(require('fs').readFileSync('src/core/i18n/locales/en.json','utf8')); console.log('valid')"`
Expected: prints `valid` with no error.

- [ ] **Step 4: Create the admin shell layout**

Create `D:\CODE\startica\app\src\layouts\admin.vue`:

```vue
<script setup lang="ts">
const { t } = useI18n()
const { user, logout } = useAuth()
const tenantStore = useTenantStore()

const navItems = computed(() => [
  { label: t('nav.overview'), to: '/', enabled: true },
  { label: t('nav.kindergartens'), to: '/kindergartens', enabled: user.value?.role === 'super_admin' },
  { label: t('nav.staff'), to: '/staff', enabled: false },
  { label: t('nav.groups'), to: '/groups', enabled: false },
  { label: t('nav.children'), to: '/children', enabled: false },
])

async function onLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex min-h-screen bg-app-bg">
    <aside class="flex w-64 flex-col bg-neutral-600 text-white">
      <div class="px-6 py-5 text-lg font-semibold">{{ t('common.appName') }}</div>
      <nav class="flex-1 space-y-1 px-3">
        <template v-for="item in navItems" :key="item.to">
          <NuxtLink
            v-if="item.enabled"
            :to="item.to"
            class="block rounded-md px-3 py-2 text-sm font-medium hover:bg-white/10"
            active-class="bg-teal-700"
          >
            {{ item.label }}
          </NuxtLink>
          <span v-else class="flex items-center justify-between rounded-md px-3 py-2 text-sm text-white/40">
            {{ item.label }}
            <UBadge size="xs" color="neutral" variant="soft">{{ t('nav.comingSoon') }}</UBadge>
          </span>
        </template>
      </nav>
    </aside>

    <div class="flex flex-1 flex-col">
      <header class="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-6">
        <USelect
          v-if="user?.role === 'super_admin' || user?.role === 'admin'"
          :model-value="tenantStore.selectedKindergartenId"
          :items="[{ label: t('tenant.all'), value: 'ALL' }]"
          class="w-56"
          @update:model-value="(value) => tenantStore.selectKindergarten(value as string)"
        />
        <div class="flex items-center gap-4">
          <LanguageSwitcher />
          <span class="text-sm text-neutral-600">{{ user?.fullName }}</span>
          <UButton color="neutral" variant="ghost" size="sm" @click="onLogout">
            {{ t('auth.logout') }}
          </UButton>
        </div>
      </header>

      <main class="flex-1 p-8">
        <slot />
      </main>
    </div>
  </div>
</template>
```

Note: the topbar's `USelect` only ever offers `'ALL'` for now — there's no per-user kindergarten-assignment data available client-side yet (that lands with the Staff module). It's wired up now so Staff/Groups/Children don't need to touch this layout when they add real options.

- [ ] **Step 5: Switch `index.vue` to the admin layout**

Open `D:\CODE\startica\app\src\pages\index.vue` and replace its entire contents with:

```vue
<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const { user } = useAuth()
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-neutral-800">
      {{ t('auth.welcomeBack', { name: user?.fullName }) }}
    </h1>
    <p class="mt-1 text-sm text-neutral-500">
      {{ user ? t(`auth.role.${user.role}`) : '' }}
    </p>
  </div>
</template>
```

(The logout button moves to the new shared topbar built in Step 4 — it's no longer this page's responsibility.)

- [ ] **Step 6: Verify build and typecheck**

Run: `cd "D:/CODE/startica/app" && npm run typecheck && npm run build`
Expected: both succeed (`✨ Build complete!`).

- [ ] **Step 7: Commit**

```bash
git add src/core/i18n/locales/ro.json src/core/i18n/locales/en.json src/layouts/admin.vue src/pages/index.vue
git commit -m "feat: add admin shell layout (sidebar + topbar) and wire index.vue to it"
```

---

### Task 8: `KindergartensListPage.vue` (list + create/edit modals + suspend/reactivate)

**Files:**
- Modify: `D:\CODE\startica\app\src\core\i18n\locales\ro.json`
- Modify: `D:\CODE\startica\app\src\core\i18n\locales\en.json`
- Create: `D:\CODE\startica\app\src\modules\kindergartens\pages\KindergartensListPage.vue`

**Interfaces:**
- Consumes: `useKindergartens()` (Task 6), `usePermissions()` (Task 3), `kindergartenDetailsSchema`/`kindergartenSettingsSchema` (Task 2), Nuxt UI's `UTable`, `UModal`, `UBadge`, `USelect`, `UForm`/`UFormField`/`UInput`/`UButton`, `useToast()`.

No unit test for this task — it's a page component exercised by Playwright in Task 10 (consistent with the auth module's pages, which also have no dedicated component tests).

- [ ] **Step 1: Add the `kindergartens.*` i18n keys to `ro.json`**

In `D:\CODE\startica\app\src\core\i18n\locales\ro.json`, add this top-level key (sibling of `"nav"`/`"tenant"` added in Task 7):

```json
  "kindergartens": {
    "pageTitle": "Grădinițe",
    "new": "Grădiniță nouă",
    "empty": "Nu există grădinițe.",
    "table": {
      "name": "Nume",
      "city": "Oraș",
      "status": "Stare",
      "createdAt": "Creat la",
      "actions": "Acțiuni"
    },
    "status": {
      "active": "Activă",
      "suspended": "Suspendată"
    },
    "createTitle": "Grădiniță nouă",
    "editTitle": "Editează grădinița",
    "detailsSection": "Detalii",
    "settingsSection": "Setări",
    "name": "Nume",
    "address": "Adresă",
    "city": "Oraș",
    "phone": "Telefon",
    "timezone": "Fus orar",
    "defaultLocale": "Limbă implicită",
    "workingHoursStart": "Program - început",
    "workingHoursEnd": "Program - sfârșit",
    "suspend": "Suspendă",
    "reactivate": "Reactivează",
    "confirmSuspendTitle": "Suspendă grădinița?",
    "confirmSuspendBody": "Personalul asociat nu va mai putea accesa această grădiniță cât timp este suspendată.",
    "confirmReactivateTitle": "Reactivează grădinița?",
    "confirmReactivateBody": "Grădinița va fi din nou accesibilă.",
    "confirm": "Confirmă",
    "createSuccess": "Grădinița a fost creată.",
    "updateSuccess": "Modificările au fost salvate."
  }
```

- [ ] **Step 2: Add the matching keys to `en.json`**

In `D:\CODE\startica\app\src\core\i18n\locales\en.json`:

```json
  "kindergartens": {
    "pageTitle": "Kindergartens",
    "new": "New kindergarten",
    "empty": "No kindergartens yet.",
    "table": {
      "name": "Name",
      "city": "City",
      "status": "Status",
      "createdAt": "Created at",
      "actions": "Actions"
    },
    "status": {
      "active": "Active",
      "suspended": "Suspended"
    },
    "createTitle": "New kindergarten",
    "editTitle": "Edit kindergarten",
    "detailsSection": "Details",
    "settingsSection": "Settings",
    "name": "Name",
    "address": "Address",
    "city": "City",
    "phone": "Phone",
    "timezone": "Timezone",
    "defaultLocale": "Default locale",
    "workingHoursStart": "Working hours - start",
    "workingHoursEnd": "Working hours - end",
    "suspend": "Suspend",
    "reactivate": "Reactivate",
    "confirmSuspendTitle": "Suspend this kindergarten?",
    "confirmSuspendBody": "Associated staff will no longer be able to access it while suspended.",
    "confirmReactivateTitle": "Reactivate this kindergarten?",
    "confirmReactivateBody": "The kindergarten will be accessible again.",
    "confirm": "Confirm",
    "createSuccess": "Kindergarten created.",
    "updateSuccess": "Changes saved."
  }
```

- [ ] **Step 3: Verify the i18n JSON is still valid**

Run: `cd "D:/CODE/startica/app" && node -e "JSON.parse(require('fs').readFileSync('src/core/i18n/locales/ro.json','utf8')); JSON.parse(require('fs').readFileSync('src/core/i18n/locales/en.json','utf8')); console.log('valid')"`
Expected: prints `valid`.

- [ ] **Step 4: Write `KindergartensListPage.vue`**

Create `D:\CODE\startica\app\src\modules\kindergartens\pages\KindergartensListPage.vue`:

```vue
<script setup lang="ts">
import { h, reactive, ref, computed, onMounted } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { FormSubmitEvent } from '@nuxt/ui'
import {
  kindergartenDetailsSchema,
  kindergartenSettingsSchema,
  type KindergartenDetailsInput,
  type KindergartenSettingsInput,
} from '~/shared/schemas/kindergarten.schema'
import type { Kindergarten } from '../types/kindergarten.types'

const { t } = useI18n()
const toast = useToast()
const { can } = usePermissions()
const { items, loading, fetchAll, create, updateDetails, updateSettings, setStatus } = useKindergartens()

onMounted(() => {
  fetchAll()
})

const createModalOpen = ref(false)
const createState = reactive<Partial<KindergartenDetailsInput>>({ name: undefined, address: undefined, city: undefined, phone: undefined })

async function onCreateSubmit(event: FormSubmitEvent<KindergartenDetailsInput>) {
  const ok = await create(event.data)
  if (ok) {
    createModalOpen.value = false
    toast.add({ title: t('kindergartens.createSuccess'), color: 'success' })
  }
}

const editModalOpen = ref(false)
const editTarget = ref<Kindergarten | null>(null)
const editDetailsState = reactive<Partial<KindergartenDetailsInput>>({})
const editSettingsState = reactive<Partial<KindergartenSettingsInput>>({})

function openEdit(kindergarten: Kindergarten) {
  editTarget.value = kindergarten
  editDetailsState.name = kindergarten.name
  editDetailsState.address = kindergarten.address ?? undefined
  editDetailsState.city = kindergarten.city ?? undefined
  editDetailsState.phone = kindergarten.phone ?? undefined
  editSettingsState.timezone = kindergarten.settings.timezone
  editSettingsState.defaultLocale = kindergarten.settings.defaultLocale
  editSettingsState.workingHoursStart = kindergarten.settings.workingHours.start
  editSettingsState.workingHoursEnd = kindergarten.settings.workingHours.end
  editModalOpen.value = true
}

async function onEditDetailsSubmit(event: FormSubmitEvent<KindergartenDetailsInput>) {
  if (!editTarget.value) return
  const ok = await updateDetails(editTarget.value.id, event.data)
  if (ok) toast.add({ title: t('kindergartens.updateSuccess'), color: 'success' })
}

async function onEditSettingsSubmit(event: FormSubmitEvent<KindergartenSettingsInput>) {
  if (!editTarget.value) return
  const ok = await updateSettings(editTarget.value.id, event.data)
  if (ok) toast.add({ title: t('kindergartens.updateSuccess'), color: 'success' })
}

const confirmModalOpen = ref(false)
const confirmTarget = ref<Kindergarten | null>(null)

function openConfirm(kindergarten: Kindergarten) {
  confirmTarget.value = kindergarten
  confirmModalOpen.value = true
}

async function onConfirmStatusChange() {
  if (!confirmTarget.value) return
  const nextStatus = confirmTarget.value.status === 'active' ? 'suspended' : 'active'
  const ok = await setStatus(confirmTarget.value.id, nextStatus)
  if (ok) {
    confirmModalOpen.value = false
    toast.add({ title: t('kindergartens.updateSuccess'), color: 'success' })
  }
}

// computed, not a plain const — header strings must re-evaluate when the
// active locale changes (LanguageSwitcher), otherwise headers freeze at
// whatever language was active on first render.
const columns = computed<TableColumn<Kindergarten>[]>(() => [
  { accessorKey: 'name', header: t('kindergartens.table.name') },
  { accessorKey: 'city', header: t('kindergartens.table.city') },
  {
    accessorKey: 'status',
    header: t('kindergartens.table.status'),
    cell: ({ row }) =>
      h(
        resolveComponent('UBadge'),
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
        can('update', 'kindergarten')
          ? h(
              resolveComponent('UButton'),
              { size: 'xs', color: 'neutral', variant: 'soft', onClick: () => openEdit(row.original) },
              () => t('common.edit'),
            )
          : null,
        can('update', 'kindergarten')
          ? h(
              resolveComponent('UButton'),
              { size: 'xs', color: 'neutral', variant: 'soft', onClick: () => openConfirm(row.original) },
              () => t(row.original.status === 'active' ? 'kindergartens.suspend' : 'kindergartens.reactivate'),
            )
          : null,
      ]),
  },
])

const confirmTitle = computed(() =>
  confirmTarget.value?.status === 'active' ? t('kindergartens.confirmSuspendTitle') : t('kindergartens.confirmReactivateTitle'),
)
const confirmBody = computed(() =>
  confirmTarget.value?.status === 'active' ? t('kindergartens.confirmSuspendBody') : t('kindergartens.confirmReactivateBody'),
)
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-xl font-semibold text-neutral-800">{{ t('kindergartens.pageTitle') }}</h1>
      <UModal v-if="can('create', 'kindergarten')" v-model:open="createModalOpen">
        <UButton color="primary">{{ t('kindergartens.new') }}</UButton>

        <template #header>
          <h2 class="text-lg font-semibold">{{ t('kindergartens.createTitle') }}</h2>
        </template>

        <template #body>
          <UForm :schema="kindergartenDetailsSchema" :state="createState" class="space-y-4" @submit="onCreateSubmit">
            <UFormField :label="t('kindergartens.name')" name="name">
              <UInput v-model="createState.name" class="w-full" />
            </UFormField>
            <UFormField :label="t('kindergartens.address')" name="address">
              <UInput v-model="createState.address" class="w-full" />
            </UFormField>
            <UFormField :label="t('kindergartens.city')" name="city">
              <UInput v-model="createState.city" class="w-full" />
            </UFormField>
            <UFormField :label="t('kindergartens.phone')" name="phone">
              <UInput v-model="createState.phone" class="w-full" />
            </UFormField>
            <UButton type="submit" color="primary" block loading-auto :loading="loading">
              {{ t('common.save') }}
            </UButton>
          </UForm>
        </template>
      </UModal>
    </div>

    <UTable :data="items" :columns="columns" :loading="loading">
      <template #empty>
        <p class="py-8 text-center text-sm text-neutral-500">{{ t('kindergartens.empty') }}</p>
      </template>
    </UTable>

    <UModal v-model:open="editModalOpen">
      <template #header>
        <h2 class="text-lg font-semibold">{{ t('kindergartens.editTitle') }}</h2>
      </template>

      <template #body>
        <div class="space-y-6">
          <section>
            <h3 class="mb-3 text-sm font-semibold text-neutral-600">{{ t('kindergartens.detailsSection') }}</h3>
            <UForm :schema="kindergartenDetailsSchema" :state="editDetailsState" class="space-y-4" @submit="onEditDetailsSubmit">
              <UFormField :label="t('kindergartens.name')" name="name">
                <UInput v-model="editDetailsState.name" class="w-full" />
              </UFormField>
              <UFormField :label="t('kindergartens.address')" name="address">
                <UInput v-model="editDetailsState.address" class="w-full" />
              </UFormField>
              <UFormField :label="t('kindergartens.city')" name="city">
                <UInput v-model="editDetailsState.city" class="w-full" />
              </UFormField>
              <UFormField :label="t('kindergartens.phone')" name="phone">
                <UInput v-model="editDetailsState.phone" class="w-full" />
              </UFormField>
              <UButton type="submit" color="primary" loading-auto :loading="loading">{{ t('common.save') }}</UButton>
            </UForm>
          </section>

          <section>
            <h3 class="mb-3 text-sm font-semibold text-neutral-600">{{ t('kindergartens.settingsSection') }}</h3>
            <UForm :schema="kindergartenSettingsSchema" :state="editSettingsState" class="space-y-4" @submit="onEditSettingsSubmit">
              <UFormField :label="t('kindergartens.timezone')" name="timezone">
                <UInput v-model="editSettingsState.timezone" class="w-full" />
              </UFormField>
              <UFormField :label="t('kindergartens.defaultLocale')" name="defaultLocale">
                <USelect
                  v-model="editSettingsState.defaultLocale"
                  :items="[{ label: 'Română', value: 'ro' }, { label: 'English', value: 'en' }]"
                  class="w-full"
                />
              </UFormField>
              <UFormField :label="t('kindergartens.workingHoursStart')" name="workingHoursStart">
                <UInput v-model="editSettingsState.workingHoursStart" class="w-full" />
              </UFormField>
              <UFormField :label="t('kindergartens.workingHoursEnd')" name="workingHoursEnd">
                <UInput v-model="editSettingsState.workingHoursEnd" class="w-full" />
              </UFormField>
              <UButton type="submit" color="primary" loading-auto :loading="loading">{{ t('common.save') }}</UButton>
            </UForm>
          </section>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="confirmModalOpen">
      <template #header>
        <h2 class="text-lg font-semibold">{{ confirmTitle }}</h2>
      </template>
      <template #body>
        <p class="text-sm text-neutral-600">{{ confirmBody }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <UButton color="neutral" variant="soft" @click="confirmModalOpen = false">{{ t('common.cancel') }}</UButton>
          <UButton color="primary" loading-auto :loading="loading" @click="onConfirmStatusChange">
            {{ t('kindergartens.confirm') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 5: Verify build and typecheck**

Run: `cd "D:/CODE/startica/app" && npm run typecheck && npm run build`
Expected: both succeed. If `resolveComponent` isn't recognized, add `import { resolveComponent } from 'vue'` to the script's import line — Nuxt usually auto-imports it, but Vue itself also exports it explicitly, so the explicit import is the safe fallback.

- [ ] **Step 6: Commit**

```bash
git add src/core/i18n/locales/ro.json src/core/i18n/locales/en.json src/modules/kindergartens/pages/KindergartensListPage.vue
git commit -m "feat(kindergartens): add KindergartensListPage (list, create/edit modals, suspend/reactivate)"
```

---

### Task 9: Route file + role gating

**Files:**
- Create: `D:\CODE\startica\app\src\pages\kindergartens.vue`

**Interfaces:**
- Consumes: `KindergartensListPage.vue` (Task 8), the existing `role.ts` named middleware (`src/middleware/role.ts`, built in the auth module but never wired to a real page until now) and the existing `roles` page-meta type (`src/shared/types/page-meta.d.ts`).

- [ ] **Step 1: Write the thin route file**

Create `D:\CODE\startica\app\src\pages\kindergartens.vue`:

```vue
<script setup lang="ts">
import KindergartensListPage from '~/modules/kindergartens/pages/KindergartensListPage.vue'

definePageMeta({ layout: 'admin', middleware: ['role'], roles: ['super_admin'] })
</script>

<template>
  <KindergartensListPage />
</template>
```

Note: this page has no `public: true` meta, so it's protected by the global `auth.global.ts` middleware by default (same as `index.vue` — pages require authentication unless explicitly marked `public`). The `role` middleware additionally restricts it to `super_admin` once authenticated.

- [ ] **Step 2: Verify build and typecheck**

Run: `cd "D:/CODE/startica/app" && npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add src/pages/kindergartens.vue
git commit -m "feat(kindergartens): wire /kindergartens route with super_admin role gating"
```

---

### Task 10: Playwright e2e tests + final verification

**Files:**
- Create: `D:\CODE\startica\app\tests\e2e\kindergartens.spec.ts`

**Interfaces:**
- Consumes: the full Kindergartens flow built in Tasks 1–9, against the seeded local Supabase stack (`admin@startica.dev` / `Startica123!` for Super Admin, `educator.demo@startica.dev` / `Startica123!` for the negative role-gating case — both seeded in `supabase/seed.sql`).

- [ ] **Step 1: Write the e2e test**

Create `D:\CODE\startica\app\tests\e2e\kindergartens.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Parolă').fill('Startica123!')
  await page.getByRole('button', { name: /autentificare/i }).click()
  await expect(page).toHaveURL('http://localhost:3000/')
}

test.describe('kindergartens', () => {
  test('super admin can create, edit, and suspend a kindergarten', async ({ page }) => {
    await login(page, 'admin@startica.dev')

    await page.getByRole('link', { name: 'Grădinițe' }).click()
    await expect(page).toHaveURL('http://localhost:3000/kindergartens')
    await expect(page.getByRole('cell', { name: 'Grădinița Zâna Florilor' })).toBeVisible()

    await page.getByRole('button', { name: 'Grădiniță nouă' }).click()
    await page.getByLabel('Nume').fill('Grădinița Curcubeu')
    await page.getByRole('button', { name: 'Salvează' }).click()
    await expect(page.getByText('Grădinița a fost creată.')).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Grădinița Curcubeu' })).toBeVisible()

    const newRow = page.getByRole('row', { name: /Grădinița Curcubeu/ })
    await newRow.getByRole('button', { name: 'Editează' }).click()
    await page.getByLabel('Oraș').fill('Timișoara')
    await page.getByRole('button', { name: 'Salvează' }).first().click()
    await expect(page.getByText('Modificările au fost salvate.')).toBeVisible()

    await newRow.getByRole('button', { name: 'Suspendă' }).click()
    await page.getByRole('button', { name: 'Confirmă' }).click()
    await expect(newRow.getByText('Suspendată')).toBeVisible()

    await newRow.getByRole('button', { name: 'Reactivează' }).click()
    await page.getByRole('button', { name: 'Confirmă' }).click()
    await expect(newRow.getByText('Activă')).toBeVisible()
  })

  test('a non-super-admin cannot reach /kindergartens', async ({ page }) => {
    await login(page, 'educator.demo@startica.dev')

    await page.goto('/kindergartens')
    await expect(page).toHaveURL('http://localhost:3000/')
  })
})
```

- [ ] **Step 2: Make sure the local Supabase stack is running**

Run: `cd "D:/CODE/startica/app" && npx supabase status`
Expected: all services report running. If not, run `npx supabase start` first.

- [ ] **Step 3: Run the e2e suite**

Run: `cd "D:/CODE/startica/app" && npm run test:e2e`
Expected: 5 passed (the 3 existing auth specs + the 2 new kindergartens specs). If a selector doesn't match (e.g. Nuxt UI renders the table differently than expected), run with `--headed` or inspect `playwright-report/index.html` and adjust the selector in `tests/e2e/kindergartens.spec.ts` to match the actual rendered markup — `UTable` row/cell accessibility roles can vary slightly by Nuxt UI minor version.

- [ ] **Step 4: Full final verification**

Run, in order:

```bash
cd "D:/CODE/startica/app"
npm run build
npx nuxi typecheck
npm run test
npm run test:e2e
```

Expected: all four succeed with exit code 0.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/kindergartens.spec.ts
git commit -m "test(kindergartens): add Playwright e2e coverage for the kindergartens flow"
```
