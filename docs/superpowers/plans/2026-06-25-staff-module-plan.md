# Staff Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Staff management screen (list per kindergarten, invite by email via server route, edit name/role, deactivate/reactivate, remove from kindergarten) for Super Admin and Admin, plus an accept-invite page so newly invited staff can set their password.

**Architecture:** Same `Component → composable (useStaff) → Pinia store (staff.store) → service (staff.service) → Supabase` layering as the Kindergartens module. The invite flow is the exception: creating an auth user requires the service-role key (never safe client-side), so the store's `invite` action calls a Nuxt server route (`POST /api/staff/invite`) that uses the already-wired `createSupabaseAdminClient()` helper. The admin shell's tenant selector is updated so Staff (and every future per-kindergarten module) can scope its list view.

**Tech Stack:** Nuxt UI v3.3.7 (`UTable`, `UModal`, `UBadge`, `USelect`, `UForm`/`UFormField`/`UInput`/`UButton`, `useToast()`), Pinia, Zod v4, Vitest, Playwright — all already installed.

## Global Constraints

- `services/*.service.ts` is the only layer that calls `client.from(...)` — stores and components never touch Supabase directly.
- Every write sets `created_by`/`updated_by` explicitly; no DB default populates these.
- Reads filter `deleted_at IS NULL` — even where RLS also enforces it.
- No hardcoded user-facing strings — every label/message goes through `useI18n()` and a key in both `ro.json` and `en.json`.
- Modules never import from each other except via `shared/` or another module's public Pinia store — `staff.store.ts` may call `useAuthStore()` for the actor id.
- Playwright config renders in `ro-RO` locale — e2e selectors must use the Romanian copy.
- Zod v4 syntax: `z.email()` (not `z.string().email()`), `z.string().min(2)`, `z.enum([...])`.
- Don't `git push` as part of any task's commit step — commits stay local until the user asks to push.
- The server route `server/api/staff/invite.post.ts` uses `createSupabaseAdminClient()` (already in `src/core/supabase/client.ts`) and `createSupabaseServerClient(event)` for session verification — import both from `~/core/supabase/client`.

---

### Task 1: Staff types + Zod schemas (TDD)

**Files:**
- Create: `D:\CODE\startica\app\src\modules\staff\types\staff.types.ts`
- Create: `D:\CODE\startica\app\src\shared\schemas\staff.schema.ts`
- Create: `D:\CODE\startica\app\src\shared\schemas\staff.schema.test.ts`

**Interfaces:**
- Produces: `StaffMember { id, email, fullName, role, status, avatarUrl }` — the camelCase app-facing shape.
- Produces: `inviteStaffSchema` → `InviteStaffInput { email, fullName, role: 'admin'|'educator', kindergartenId }`.
- Produces: `updateStaffSchema` → `UpdateStaffInput { fullName, role?: 'super_admin'|'admin'|'educator' }`.

- [ ] **Step 1: Write the failing schema tests**

Create `D:\CODE\startica\app\src\shared\schemas\staff.schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { inviteStaffSchema, updateStaffSchema } from './staff.schema'

describe('inviteStaffSchema', () => {
  it('accepts a valid invite payload', () => {
    const result = inviteStaffSchema.safeParse({
      email: 'ion.popescu@example.com',
      fullName: 'Ion Popescu',
      role: 'educator',
      kindergartenId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid email', () => {
    const result = inviteStaffSchema.safeParse({
      email: 'not-an-email',
      fullName: 'Ion Popescu',
      role: 'educator',
      kindergartenId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a full name shorter than 2 characters', () => {
    const result = inviteStaffSchema.safeParse({
      email: 'ion@example.com',
      fullName: 'I',
      role: 'educator',
      kindergartenId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    })
    expect(result.success).toBe(false)
  })

  it('rejects role super_admin (not assignable via invite)', () => {
    const result = inviteStaffSchema.safeParse({
      email: 'ion@example.com',
      fullName: 'Ion Popescu',
      role: 'super_admin',
      kindergartenId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-UUID kindergartenId', () => {
    const result = inviteStaffSchema.safeParse({
      email: 'ion@example.com',
      fullName: 'Ion Popescu',
      role: 'educator',
      kindergartenId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })
})

describe('updateStaffSchema', () => {
  it('accepts fullName without role', () => {
    const result = updateStaffSchema.safeParse({ fullName: 'Ion Popescu' })
    expect(result.success).toBe(true)
  })

  it('accepts fullName with role', () => {
    const result = updateStaffSchema.safeParse({ fullName: 'Ion Popescu', role: 'admin' })
    expect(result.success).toBe(true)
  })

  it('rejects short fullName', () => {
    const result = updateStaffSchema.safeParse({ fullName: 'I' })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "D:/CODE/startica/app" && npm run test -- staff.schema`
Expected: FAIL with "Cannot find module './staff.schema'"

- [ ] **Step 3: Create the type file**

Create `D:\CODE\startica\app\src\modules\staff\types\staff.types.ts`:

```ts
export type StaffMember = {
  id: string
  email: string
  fullName: string
  role: 'super_admin' | 'admin' | 'educator'
  status: 'active' | 'inactive'
  avatarUrl: string | null
}
```

- [ ] **Step 4: Create the schema file**

Create `D:\CODE\startica\app\src\shared\schemas\staff.schema.ts`:

```ts
import { z } from 'zod'

export const inviteStaffSchema = z.object({
  email: z.email(),
  fullName: z.string().min(2),
  role: z.enum(['admin', 'educator']),
  kindergartenId: z.string().uuid(),
})

export const updateStaffSchema = z.object({
  fullName: z.string().min(2),
  role: z.enum(['super_admin', 'admin', 'educator']).optional(),
})

export type InviteStaffInput = z.infer<typeof inviteStaffSchema>
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "D:/CODE/startica/app" && npm run test -- staff.schema`
Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/modules/staff/types/staff.types.ts src/shared/schemas/staff.schema.ts src/shared/schemas/staff.schema.test.ts
git commit -m "feat(staff): add StaffMember type and Zod schemas (TDD)"
```

---

### Task 2: Extend usePermissions for staff resource (TDD)

**Files:**
- Modify: `D:\CODE\startica\app\src\shared\composables\usePermissions.ts`
- Modify: `D:\CODE\startica\app\src\shared\composables\usePermissions.test.ts`

**Interfaces:**
- Consumes: `usePermissions.ts` currently exports `PermissionAction`, `PermissionResource = 'kindergarten'`, `usePermissions()`.
- Produces: `PermissionResource = 'kindergarten' | 'staff'`. The `can()` function for `'staff'`: super_admin and admin → `true` for all 4 actions; educator → `false` for all.

- [ ] **Step 1: Write the failing tests**

In `D:\CODE\startica\app\src\shared\composables\usePermissions.test.ts`, add these tests after the existing ones:

```ts
  it('lets a super_admin do all staff actions', () => {
    setUserRole('super_admin')
    const { can } = usePermissions()

    expect(can('create', 'staff')).toBe(true)
    expect(can('read', 'staff')).toBe(true)
    expect(can('update', 'staff')).toBe(true)
    expect(can('delete', 'staff')).toBe(true)
  })

  it('lets an admin do all staff actions', () => {
    setUserRole('admin')
    const { can } = usePermissions()

    expect(can('create', 'staff')).toBe(true)
    expect(can('read', 'staff')).toBe(true)
    expect(can('update', 'staff')).toBe(true)
    expect(can('delete', 'staff')).toBe(true)
  })

  it('denies all staff actions for an educator', () => {
    setUserRole('educator')
    const { can } = usePermissions()

    expect(can('create', 'staff')).toBe(false)
    expect(can('read', 'staff')).toBe(false)
    expect(can('update', 'staff')).toBe(false)
    expect(can('delete', 'staff')).toBe(false)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "D:/CODE/startica/app" && npm run test -- usePermissions`
Expected: 3 new tests FAIL (TypeScript error: `'staff'` not assignable to `PermissionResource`).

- [ ] **Step 3: Extend usePermissions**

Replace `D:\CODE\startica\app\src\shared\composables\usePermissions.ts` with:

```ts
import { useAuthStore } from '~/modules/auth/stores/auth.store'

export type PermissionAction = 'create' | 'read' | 'update' | 'delete'
export type PermissionResource = 'kindergarten' | 'staff'

export function usePermissions() {
  const authStore = useAuthStore()

  function can(action: PermissionAction, resource: PermissionResource, _target?: unknown): boolean {
    const role = authStore.user?.role
    if (!role) return false

    if (resource === 'kindergarten') {
      if (action === 'read') return true
      // Kindergartens are never hard-deleted (no DELETE RLS policy, no delete
      // service method, no delete UI). Returning false keeps can() honest and
      // prevents future contributors from accidentally wiring a delete button
      // off this check against an operation the DB will always reject.
      if (action === 'delete') return false
      return role === 'super_admin'
    }

    if (resource === 'staff') {
      return role === 'super_admin' || role === 'admin'
    }

    return false
  }

  return { can }
}
```

- [ ] **Step 4: Run all tests to verify they pass**

Run: `cd "D:/CODE/startica/app" && npm run test -- usePermissions`
Expected: all 6 tests pass (3 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/shared/composables/usePermissions.ts src/shared/composables/usePermissions.test.ts
git commit -m "feat(permissions): add staff resource to usePermissions (TDD)"
```

---

### Task 3: staff.service.ts (TDD)

**Files:**
- Create: `D:\CODE\startica\app\src\modules\staff\services\staff.service.ts`
- Create: `D:\CODE\startica\app\src\modules\staff\services\staff.service.test.ts`

**Interfaces:**
- Consumes: `Result<T>` from `~/shared/types/result`, `Database` from `~/core/supabase/types`.
- Produces:
  - `UserRow` (re-export of `Database['public']['Tables']['users']['Row']`)
  - `listStaff(client, kindergartenId): Promise<Result<UserRow[]>>`
  - `updateStaffProfile(client, userId, data: { fullName: string; role?: UserRole }, actorId): Promise<Result<UserRow>>`
  - `setStaffStatus(client, userId, status: 'active'|'inactive', actorId): Promise<Result<UserRow>>`
  - `removeFromKindergarten(client, userId, kindergartenId): Promise<Result<null>>`

**How `listStaff` works** (two-step to stay type-safe):
1. Query `user_kindergartens` for `user_id` values where `kindergarten_id = ?`
2. Query `users` with `.in('id', userIds)`, filter `deleted_at IS NULL` and `role != 'super_admin'`

- [ ] **Step 1: Write the failing tests**

Create `D:\CODE\startica\app\src\modules\staff\services\staff.service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import {
  listStaff,
  updateStaffProfile,
  setStaffStatus,
  removeFromKindergarten,
} from './staff.service'

const sampleRow = {
  id: 'user-2',
  email: 'maria@example.com',
  full_name: 'Maria Ionescu',
  role: 'admin' as const,
  status: 'active' as const,
  avatar_url: null,
  created_at: '2026-06-24T00:00:00Z',
  updated_at: '2026-06-24T00:00:00Z',
  created_by: 'user-1',
  updated_by: 'user-1',
  deleted_at: null,
}

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
      // users table
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: users, error: null }),
              }),
            }),
          }),
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

describe('listStaff', () => {
  it('returns users for the given kindergarten, excluding super_admins', async () => {
    const client = createMockClient()
    const result = await listStaff(client, 'kg-1')

    expect(result).toEqual({ success: true, data: [sampleRow] })
    expect(client.from).toHaveBeenCalledWith('user_kindergartens')
    expect(client.from).toHaveBeenCalledWith('users')
  })

  it('returns an empty array when the kindergarten has no members', async () => {
    const client = createMockClient({ memberships: [] })
    const result = await listStaff(client, 'kg-1')

    expect(result).toEqual({ success: true, data: [] })
  })
})

describe('updateStaffProfile', () => {
  it('sets full_name and updated_by', async () => {
    const client = createMockClient()
    const result = await updateStaffProfile(client, 'user-2', { fullName: 'Maria I.' }, 'user-1')

    expect(result).toEqual({ success: true, data: sampleRow })
    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith(expect.objectContaining({
      full_name: 'Maria I.',
      updated_by: 'user-1',
    }))
  })

  it('includes role in the update when provided', async () => {
    const client = createMockClient()
    await updateStaffProfile(client, 'user-2', { fullName: 'Maria I.', role: 'educator' }, 'user-1')

    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith(expect.objectContaining({ role: 'educator' }))
  })

  it('omits role from the update when not provided', async () => {
    const client = createMockClient()
    await updateStaffProfile(client, 'user-2', { fullName: 'Maria I.' }, 'user-1')

    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    const callArg = updateCall.mock.calls[0][0] as Record<string, unknown>
    expect(callArg).not.toHaveProperty('role')
  })
})

describe('setStaffStatus', () => {
  it('updates status and updated_by', async () => {
    const client = createMockClient()
    await setStaffStatus(client, 'user-2', 'inactive', 'user-1')

    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith({ status: 'inactive', updated_by: 'user-1' })
  })
})

describe('removeFromKindergarten', () => {
  it('deletes the user_kindergartens row', async () => {
    const client = createMockClient()
    const result = await removeFromKindergarten(client, 'user-2', 'kg-1')

    expect(result).toEqual({ success: true, data: null })
    expect(client.from).toHaveBeenCalledWith('user_kindergartens')
  })

  it('returns failure when the delete errors', async () => {
    const client = createMockClient({ deleteError: { message: 'delete failed' } })
    const result = await removeFromKindergarten(client, 'user-2', 'kg-1')

    expect(result).toEqual({ success: false, error: 'delete failed' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "D:/CODE/startica/app" && npm run test -- staff.service`
Expected: FAIL with "Cannot find module './staff.service'"

- [ ] **Step 3: Implement the service**

Create `D:\CODE\startica\app\src\modules\staff\services\staff.service.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'

type Client = SupabaseClient<Database>
export type UserRow = Database['public']['Tables']['users']['Row']
type UserRole = Database['public']['Enums']['user_role']
type UserStatus = Database['public']['Enums']['user_status']

export async function listStaff(
  client: Client,
  kindergartenId: string,
): Promise<Result<UserRow[]>> {
  // Step 1: get user IDs that belong to this kindergarten
  const { data: memberships, error: linkErr } = await client
    .from('user_kindergartens')
    .select('user_id')
    .eq('kindergarten_id', kindergartenId)

  if (linkErr || !memberships) return { success: false, error: linkErr?.message ?? 'list_failed' }
  if (memberships.length === 0) return { success: true, data: [] }

  const userIds = memberships.map((m) => m.user_id)

  // Step 2: fetch profiles, excluding soft-deleted rows and super_admins
  const { data, error } = await client
    .from('users')
    .select('*')
    .in('id', userIds)
    .is('deleted_at', null)
    .neq('role', 'super_admin')
    .order('full_name')

  if (error || !data) return { success: false, error: error?.message ?? 'list_failed' }
  return { success: true, data }
}

export async function updateStaffProfile(
  client: Client,
  userId: string,
  data: { fullName: string; role?: UserRole },
  actorId: string,
): Promise<Result<UserRow>> {
  const payload: Database['public']['Tables']['users']['Update'] = {
    full_name: data.fullName,
    updated_by: actorId,
    ...(data.role !== undefined && { role: data.role }),
  }

  const { data: updated, error } = await client
    .from('users')
    .update(payload)
    .eq('id', userId)
    .select('*')
    .single()

  if (error || !updated) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data: updated }
}

export async function setStaffStatus(
  client: Client,
  userId: string,
  status: UserStatus,
  actorId: string,
): Promise<Result<UserRow>> {
  const { data, error } = await client
    .from('users')
    .update({ status, updated_by: actorId })
    .eq('id', userId)
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data }
}

export async function removeFromKindergarten(
  client: Client,
  userId: string,
  kindergartenId: string,
): Promise<Result<null>> {
  const { error } = await client
    .from('user_kindergartens')
    .delete()
    .eq('user_id', userId)
    .eq('kindergarten_id', kindergartenId)

  if (error) return { success: false, error: error.message }
  return { success: true, data: null }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "D:/CODE/startica/app" && npm run test -- staff.service`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/staff/services/staff.service.ts src/modules/staff/services/staff.service.test.ts
git commit -m "feat(staff): add staff.service.ts (TDD)"
```

---

### Task 4: staff.store.ts + useStaff composable (TDD)

**Files:**
- Create: `D:\CODE\startica\app\src\modules\staff\stores\staff.store.ts`
- Create: `D:\CODE\startica\app\src\modules\staff\stores\staff.store.test.ts`
- Create: `D:\CODE\startica\app\src\modules\staff\composables\useStaff.ts`

**Interfaces:**
- Consumes: all four service functions from Task 3; `useAuthStore()` for actor id; `$fetch` (Nuxt global) for the invite server route.
- Produces: `useStaffStore()` with state `{ items: StaffMember[], loading: boolean, error: string | null }` and actions `fetchAll(kindergartenId)`, `invite(input: InviteStaffInput)`, `updateProfile(userId, data)`, `setStatus(userId, status)`, `remove(userId, kindergartenId)`.
- Produces: `useStaff()` composable mirroring `useKindergartens()` shape.

**Row → `StaffMember` mapping** (`toStaffMember`):
```ts
function toStaffMember(row: UserRow): StaffMember {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role as StaffMember['role'],
    status: row.status,
    avatarUrl: row.avatar_url ?? null,
  }
}
```

**`invite` action flow**: calls `$fetch('/api/staff/invite', { method: 'POST', body: input })`, then calls `fetchAll(input.kindergartenId)` to refresh the list. Returns `true` on success.

- [ ] **Step 1: Write the failing tests**

Create `D:\CODE\startica\app\src\modules\staff\stores\staff.store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('~/core/supabase/client', () => ({
  useSupabaseClient: () => ({}),
}))

vi.mock('../services/staff.service')

import { useStaffStore } from './staff.store'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as staffService from '../services/staff.service'

const sampleRow = {
  id: 'user-2',
  email: 'maria@example.com',
  full_name: 'Maria Ionescu',
  role: 'admin' as const,
  status: 'active' as const,
  avatar_url: null,
  created_at: '2026-06-24T00:00:00Z',
  updated_at: '2026-06-24T00:00:00Z',
  created_by: 'user-1',
  updated_by: 'user-1',
  deleted_at: null,
}

const sampleMember = {
  id: 'user-2',
  email: 'maria@example.com',
  fullName: 'Maria Ionescu',
  role: 'admin' as const,
  status: 'active' as const,
  avatarUrl: null,
}

describe('useStaffStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ success: true }))
    useAuthStore().user = {
      id: 'user-1',
      email: 'admin@startica.dev',
      fullName: 'Super Admin',
      role: 'super_admin',
      avatarUrl: null,
      status: 'active',
    }
  })

  it('fetchAll loads and maps the list', async () => {
    vi.mocked(staffService.listStaff).mockResolvedValue({ success: true, data: [sampleRow] })

    const store = useStaffStore()
    await store.fetchAll('kg-1')

    expect(store.items).toEqual([sampleMember])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('fetchAll captures the error and leaves items empty on failure', async () => {
    vi.mocked(staffService.listStaff).mockResolvedValue({ success: false, error: 'boom' })

    const store = useStaffStore()
    await store.fetchAll('kg-1')

    expect(store.items).toEqual([])
    expect(store.error).toBe('boom')
  })

  it('invite calls the server route then refreshes the list', async () => {
    vi.mocked(staffService.listStaff).mockResolvedValue({ success: true, data: [sampleRow] })

    const store = useStaffStore()
    const ok = await store.invite({
      email: 'new@example.com',
      fullName: 'Nou Educator',
      role: 'educator',
      kindergartenId: 'kg-1',
    })

    expect(ok).toBe(true)
    expect($fetch).toHaveBeenCalledWith('/api/staff/invite', {
      method: 'POST',
      body: { email: 'new@example.com', fullName: 'Nou Educator', role: 'educator', kindergartenId: 'kg-1' },
    })
    expect(staffService.listStaff).toHaveBeenCalledWith({}, 'kg-1')
  })

  it('updateProfile replaces the matching item in place', async () => {
    vi.mocked(staffService.listStaff).mockResolvedValue({ success: true, data: [sampleRow] })
    vi.mocked(staffService.updateStaffProfile).mockResolvedValue({
      success: true,
      data: { ...sampleRow, full_name: 'Maria I.' },
    })

    const store = useStaffStore()
    await store.fetchAll('kg-1')
    const ok = await store.updateProfile('user-2', { fullName: 'Maria I.' })

    expect(ok).toBe(true)
    expect(store.items[0].fullName).toBe('Maria I.')
  })

  it('setStatus updates the matching item in place', async () => {
    vi.mocked(staffService.listStaff).mockResolvedValue({ success: true, data: [sampleRow] })
    vi.mocked(staffService.setStaffStatus).mockResolvedValue({
      success: true,
      data: { ...sampleRow, status: 'inactive' },
    })

    const store = useStaffStore()
    await store.fetchAll('kg-1')
    const ok = await store.setStatus('user-2', 'inactive')

    expect(ok).toBe(true)
    expect(store.items[0].status).toBe('inactive')
  })

  it('remove calls service with userId + kindergartenId and removes the item', async () => {
    vi.mocked(staffService.listStaff).mockResolvedValue({ success: true, data: [sampleRow] })
    vi.mocked(staffService.removeFromKindergarten).mockResolvedValue({ success: true, data: null })

    const store = useStaffStore()
    await store.fetchAll('kg-1')
    const ok = await store.remove('user-2', 'kg-1')

    expect(ok).toBe(true)
    expect(store.items).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "D:/CODE/startica/app" && npm run test -- staff.store`
Expected: FAIL with "Cannot find module './staff.store'"

- [ ] **Step 3: Create the store**

Create `D:\CODE\startica\app\src\modules\staff\stores\staff.store.ts`:

```ts
import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as staffService from '../services/staff.service'
import type { UserRow } from '../services/staff.service'
import type { StaffMember } from '../types/staff.types'
import type { InviteStaffInput, UpdateStaffInput } from '~/shared/schemas/staff.schema'

function toStaffMember(row: UserRow): StaffMember {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role as StaffMember['role'],
    status: row.status as StaffMember['status'],
    avatarUrl: row.avatar_url ?? null,
  }
}

export const useStaffStore = defineStore('staff', {
  state: () => ({
    items: [] as StaffMember[],
    loading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchAll(kindergartenId: string) {
      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await staffService.listStaff(client, kindergartenId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        this.items = []
        return
      }

      this.items = result.data.map(toStaffMember)
    },

    async invite(input: InviteStaffInput) {
      this.loading = true
      this.error = null

      try {
        await $fetch('/api/staff/invite', { method: 'POST', body: input })
        await this.fetchAll(input.kindergartenId)
        this.loading = false
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'invite_failed'
        this.error = msg
        this.loading = false
        return false
      }
    },

    async updateProfile(userId: string, data: UpdateStaffInput) {
      const authStore = useAuthStore()
      const actorId = authStore.user?.id
      if (!actorId) return false

      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await staffService.updateStaffProfile(client, userId, data, actorId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }

      this.replaceItem(toStaffMember(result.data))
      return true
    },

    async setStatus(userId: string, status: 'active' | 'inactive') {
      const authStore = useAuthStore()
      const actorId = authStore.user?.id
      if (!actorId) return false

      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await staffService.setStaffStatus(client, userId, status, actorId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }

      this.replaceItem(toStaffMember(result.data))
      return true
    },

    async remove(userId: string, kindergartenId: string) {
      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await staffService.removeFromKindergarten(client, userId, kindergartenId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }

      this.items = this.items.filter((item) => item.id !== userId)
      return true
    },

    replaceItem(updated: StaffMember) {
      const index = this.items.findIndex((item) => item.id === updated.id)
      if (index === -1) return
      this.items[index] = updated
    },
  },
})
```

- [ ] **Step 4: Create the composable**

Create `D:\CODE\startica\app\src\modules\staff\composables\useStaff.ts`:

```ts
import { computed } from 'vue'
import { useStaffStore } from '../stores/staff.store'
import type { InviteStaffInput, UpdateStaffInput } from '~/shared/schemas/staff.schema'

export function useStaff() {
  const store = useStaffStore()

  return {
    items: computed(() => store.items),
    loading: computed(() => store.loading),
    error: computed(() => store.error),
    fetchAll: (kindergartenId: string) => store.fetchAll(kindergartenId),
    invite: (input: InviteStaffInput) => store.invite(input),
    updateProfile: (userId: string, data: UpdateStaffInput) => store.updateProfile(userId, data),
    setStatus: (userId: string, status: 'active' | 'inactive') => store.setStatus(userId, status),
    remove: (userId: string, kindergartenId: string) => store.remove(userId, kindergartenId),
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "D:/CODE/startica/app" && npm run test -- staff.store`
Expected: 6 tests pass.

- [ ] **Step 6: Run the full test suite**

Run: `cd "D:/CODE/startica/app" && npm run test`
Expected: all existing tests still pass + 6 new ones (52 → 58 total... may vary by count).

- [ ] **Step 7: Commit**

```bash
git add src/modules/staff/stores/staff.store.ts src/modules/staff/stores/staff.store.test.ts src/modules/staff/composables/useStaff.ts
git commit -m "feat(staff): add staff.store.ts + useStaff composable (TDD)"
```

---

### Task 5: Server route — invite.post.ts

**Files:**
- Create: `D:\CODE\startica\app\server\api\staff\invite.post.ts`
- Modify: `D:\CODE\startica\app\nuxt.config.ts` — add `siteUrl` to `runtimeConfig.public`
- Modify: `D:\CODE\startica\app\.env` — add `NUXT_PUBLIC_SITE_URL`

**Interfaces:**
- Consumes: `createSupabaseAdminClient()`, `createSupabaseServerClient(event)` from `~/core/supabase/client`; `inviteStaffSchema` from `~/shared/schemas/staff.schema`; `useRuntimeConfig()` from Nuxt.
- Produces: `POST /api/staff/invite` — accepts `{ email, fullName, role, kindergartenId }`, returns `{ success: true }` or throws H3 error.

**Auth & authorization logic:**
1. Parse + validate body with `inviteStaffSchema`
2. Read caller session via `createSupabaseServerClient(event).auth.getUser()`
3. Fetch `callerProfile` from `users` via admin client (so RLS doesn't block — at this point we want the raw profile)
4. Reject if caller role is not `super_admin` or `admin`
5. If caller is `admin`, verify they belong to the target `kindergartenId` via `user_kindergartens`
6. Check if `email` already exists in `public.users` (admin client, so we see all users)
7. If exists → skip invite, upsert `user_kindergartens` only
8. If not → call `adminClient.auth.admin.inviteUserByEmail(...)`, insert into `public.users`, upsert `user_kindergartens`

- [ ] **Step 1: Add `siteUrl` to nuxt.config.ts**

In `D:\CODE\startica\app\nuxt.config.ts`, change the `runtimeConfig.public` block:

```ts
  runtimeConfig: {
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    public: {
      supabaseUrl: process.env.SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
    },
  },
```

- [ ] **Step 2: Add `NUXT_PUBLIC_SITE_URL` to `.env`**

Append to `D:\CODE\startica\app\.env`:

```
NUXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 3: Create the server route**

Create `D:\CODE\startica\app\server\api\staff\invite.post.ts`:

```ts
import { createSupabaseAdminClient, createSupabaseServerClient } from '~/core/supabase/client'
import { inviteStaffSchema } from '~/shared/schemas/staff.schema'

export default defineEventHandler(async (event) => {
  // 1. Parse and validate body
  const body = await readBody(event)
  const parsed = inviteStaffSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }
  const { email, fullName, role, kindergartenId } = parsed.data

  // 2. Verify caller is authenticated
  const userClient = createSupabaseServerClient(event)
  const { data: { user: caller } } = await userClient.auth.getUser()
  if (!caller) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 3. Fetch caller role via admin client (bypasses RLS — we always need the real role)
  const adminClient = createSupabaseAdminClient()
  const { data: callerProfile } = await adminClient
    .from('users')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (!callerProfile || !['super_admin', 'admin'].includes(callerProfile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // 4. Admin can only invite into their own kindergartens
  if (callerProfile.role === 'admin') {
    const { data: membership } = await adminClient
      .from('user_kindergartens')
      .select('user_id')
      .eq('user_id', caller.id)
      .eq('kindergarten_id', kindergartenId)
      .single()
    if (!membership) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
  }

  // 5. Check if the email already exists in public.users
  const { data: existing } = await adminClient
    .from('users')
    .select('id')
    .eq('email', email)
    .is('deleted_at', null)
    .maybeSingle()

  let userId: string

  if (existing) {
    userId = existing.id
  } else {
    // 6. Create auth user via Supabase invite email
    const config = useRuntimeConfig(event)
    const siteUrl = config.public.siteUrl

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: { full_name: fullName, role },
        redirectTo: `${siteUrl}/accept-invite`,
      },
    )
    if (inviteError || !inviteData.user) {
      throw createError({ statusCode: 500, statusMessage: inviteError?.message ?? 'invite_failed' })
    }
    userId = inviteData.user.id

    // 7. Insert into public.users
    const { error: profileError } = await adminClient.from('users').insert({
      id: userId,
      email,
      full_name: fullName,
      role,
      status: 'active',
      created_by: caller.id,
      updated_by: caller.id,
    })
    if (profileError) {
      throw createError({ statusCode: 500, statusMessage: profileError.message })
    }
  }

  // 8. Add to user_kindergartens — upsert is idempotent if already a member
  const { error: memberError } = await adminClient
    .from('user_kindergartens')
    .upsert(
      { user_id: userId, kindergarten_id: kindergartenId, created_by: caller.id },
      { onConflict: 'user_id,kindergarten_id' },
    )
  if (memberError) {
    throw createError({ statusCode: 500, statusMessage: memberError.message })
  }

  return { success: true }
})
```

- [ ] **Step 4: Verify the build still compiles**

Run: `cd "D:/CODE/startica/app" && npm run build`
Expected: build succeeds (exit code 0). If TypeScript errors appear in the server route, fix them before proceeding.

- [ ] **Step 5: Commit**

```bash
git add server/api/staff/invite.post.ts nuxt.config.ts .env
git commit -m "feat(staff): add invite server route (POST /api/staff/invite)"
```

---

### Task 6: i18n keys + admin.vue tenant selector + Staff nav

**Files:**
- Modify: `D:\CODE\startica\app\src\core\i18n\locales\ro.json`
- Modify: `D:\CODE\startica\app\src\core\i18n\locales\en.json`
- Modify: `D:\CODE\startica\app\src\layouts\admin.vue`

**What changes in admin.vue:**
1. Import and call `useKindergartensStore()` — call `fetchAll()` on `onMounted` (already built, no-op if called again).
2. Replace the hardcoded `[{ label: t('tenant.all'), value: 'ALL' }]` items with a computed list: ALL option + kindergartens from the store.
3. Enable the Staff nav item for `super_admin` and `admin`.
4. When the user is `admin` (not `super_admin`), auto-select their first kindergarten on mount if `selectedKindergartenId` is still `'ALL'`.

- [ ] **Step 1: Add `staff.*` and `auth.acceptInvite.*` keys to ro.json**

Replace `D:\CODE\startica\app\src\core\i18n\locales\ro.json` with:

```json
{
  "common": {
    "appName": "Startica",
    "save": "Salvează",
    "cancel": "Anulează",
    "delete": "Șterge",
    "edit": "Editează",
    "loading": "Se încarcă...",
    "search": "Caută"
  },
  "auth": {
    "login": "Autentificare",
    "email": "Email",
    "password": "Parolă",
    "forgotPassword": "Ai uitat parola?",
    "loginTitle": "Autentificare",
    "submit": "Autentificare",
    "invalidCredentials": "Email sau parolă incorectă.",
    "forgotPasswordTitle": "Recuperare parolă",
    "forgotPasswordSubmit": "Trimite link de resetare",
    "forgotPasswordSuccess": "Dacă adresa există în sistem, vei primi un email cu instrucțiuni de resetare.",
    "backToLogin": "Înapoi la autentificare",
    "resetPasswordTitle": "Setează o parolă nouă",
    "resetPasswordSubmit": "Salvează parola",
    "resetPasswordSuccess": "Parola a fost schimbată cu succes.",
    "resetPasswordInvalidLink": "Linkul de resetare este invalid sau a expirat.",
    "newPassword": "Parolă nouă",
    "confirmPassword": "Confirmă parola",
    "passwordMismatch": "Parolele nu coincid.",
    "logout": "Deconectare",
    "welcomeBack": "Salut, {name}",
    "role": {
      "super_admin": "Super Admin",
      "admin": "Admin",
      "educator": "Educator"
    },
    "acceptInvite": {
      "title": "Bun venit în Startica",
      "subtitle": "Setează o parolă pentru contul tău.",
      "success": "Parola a fost setată. Redirecționare..."
    }
  },
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
  },
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
  },
  "staff": {
    "pageTitle": "Personal",
    "selectKindergarten": "Selectează o grădiniță pentru a vedea personalul.",
    "empty": "Nu există personal în această grădiniță.",
    "invite": "Invită",
    "inviteTitle": "Invită un membru nou",
    "name": "Nume complet",
    "email": "Email",
    "role": "Rol",
    "table": {
      "name": "Nume",
      "email": "Email",
      "role": "Rol",
      "status": "Stare",
      "actions": "Acțiuni"
    },
    "status": {
      "active": "Activ",
      "inactive": "Inactiv"
    },
    "role": {
      "super_admin": "Super Admin",
      "admin": "Admin",
      "educator": "Educator"
    },
    "editTitle": "Editează membrul",
    "inviteSuccess": "Invitația a fost trimisă.",
    "updateSuccess": "Modificările au fost salvate.",
    "confirmDeactivateTitle": "Dezactivează membrul?",
    "confirmDeactivateBody": "Membrul nu va mai putea accesa aplicația.",
    "deactivateSuccess": "Membrul a fost dezactivat.",
    "confirmReactivateTitle": "Reactivează membrul?",
    "confirmReactivateBody": "Membrul va putea accesa din nou aplicația.",
    "reactivateSuccess": "Membrul a fost reactivat.",
    "confirmRemoveTitle": "Elimină din grădiniță?",
    "confirmRemoveBody": "Membrul va pierde accesul la această grădiniță. Contul rămâne activ.",
    "removeSuccess": "Membrul a fost eliminat din grădiniță.",
    "deactivate": "Dezactivează",
    "reactivate": "Reactivează",
    "remove": "Elimină",
    "confirm": "Confirmă"
  }
}
```

- [ ] **Step 2: Add matching keys to en.json**

Replace `D:\CODE\startica\app\src\core\i18n\locales\en.json` with:

```json
{
  "common": {
    "appName": "Startica",
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "loading": "Loading...",
    "search": "Search"
  },
  "auth": {
    "login": "Login",
    "email": "Email",
    "password": "Password",
    "forgotPassword": "Forgot password?",
    "loginTitle": "Log in",
    "submit": "Log in",
    "invalidCredentials": "Incorrect email or password.",
    "forgotPasswordTitle": "Password recovery",
    "forgotPasswordSubmit": "Send reset link",
    "forgotPasswordSuccess": "If that address exists in the system, you'll receive an email with reset instructions.",
    "backToLogin": "Back to login",
    "resetPasswordTitle": "Set a new password",
    "resetPasswordSubmit": "Save password",
    "resetPasswordSuccess": "Your password has been changed successfully.",
    "resetPasswordInvalidLink": "This reset link is invalid or has expired.",
    "newPassword": "New password",
    "confirmPassword": "Confirm password",
    "passwordMismatch": "Passwords don't match.",
    "logout": "Log out",
    "welcomeBack": "Hi, {name}",
    "role": {
      "super_admin": "Super Admin",
      "admin": "Admin",
      "educator": "Educator"
    },
    "acceptInvite": {
      "title": "Welcome to Startica",
      "subtitle": "Set a password for your account.",
      "success": "Password set. Redirecting..."
    }
  },
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
  },
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
  },
  "staff": {
    "pageTitle": "Staff",
    "selectKindergarten": "Select a kindergarten to view staff.",
    "empty": "No staff in this kindergarten.",
    "invite": "Invite",
    "inviteTitle": "Invite a new member",
    "name": "Full name",
    "email": "Email",
    "role": "Role",
    "table": {
      "name": "Name",
      "email": "Email",
      "role": "Role",
      "status": "Status",
      "actions": "Actions"
    },
    "status": {
      "active": "Active",
      "inactive": "Inactive"
    },
    "role": {
      "super_admin": "Super Admin",
      "admin": "Admin",
      "educator": "Educator"
    },
    "editTitle": "Edit member",
    "inviteSuccess": "Invitation sent.",
    "updateSuccess": "Changes saved.",
    "confirmDeactivateTitle": "Deactivate member?",
    "confirmDeactivateBody": "The member will no longer be able to access the application.",
    "deactivateSuccess": "Member deactivated.",
    "confirmReactivateTitle": "Reactivate member?",
    "confirmReactivateBody": "The member will be able to access the application again.",
    "reactivateSuccess": "Member reactivated.",
    "confirmRemoveTitle": "Remove from kindergarten?",
    "confirmRemoveBody": "The member will lose access to this kindergarten. Their account remains active.",
    "removeSuccess": "Member removed from kindergarten.",
    "deactivate": "Deactivate",
    "reactivate": "Reactivate",
    "remove": "Remove",
    "confirm": "Confirm"
  }
}
```

- [ ] **Step 3: Update admin.vue**

Replace `D:\CODE\startica\app\src\layouts\admin.vue` with:

```vue
<script setup lang="ts">
import { onMounted, computed } from 'vue'

const { t } = useI18n()
const { user, logout } = useAuth()
const tenantStore = useTenantStore()
const kindergartensStore = useKindergartensStore()

onMounted(async () => {
  await kindergartensStore.fetchAll()
  // Auto-select the first kindergarten for Admin users (they don't need the ALL view)
  if (user.value?.role === 'admin' && tenantStore.selectedKindergartenId === 'ALL') {
    const first = kindergartensStore.items[0]
    if (first) tenantStore.selectKindergarten(first.id)
  }
})

const tenantOptions = computed(() => {
  const options = []
  if (user.value?.role === 'super_admin') {
    options.push({ label: t('tenant.all'), value: 'ALL' })
  }
  for (const kg of kindergartensStore.items) {
    options.push({ label: kg.name, value: kg.id })
  }
  return options
})

const navItems = computed(() => [
  { label: t('nav.overview'), to: '/', enabled: true },
  { label: t('nav.kindergartens'), to: '/kindergartens', enabled: user.value?.role === 'super_admin' },
  {
    label: t('nav.staff'),
    to: '/staff',
    enabled: user.value?.role === 'super_admin' || user.value?.role === 'admin',
  },
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
          :items="tenantOptions"
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

- [ ] **Step 4: Run the unit tests**

Run: `cd "D:/CODE/startica/app" && npm run test`
Expected: all tests pass (no regressions — admin.vue has no unit tests, changes are verified by e2e in Task 9).

- [ ] **Step 5: Commit**

```bash
git add src/core/i18n/locales/ro.json src/core/i18n/locales/en.json src/layouts/admin.vue
git commit -m "feat(staff): add staff i18n keys, accept-invite i18n keys, functional tenant selector in admin shell"
```

---

### Task 7: AcceptInvitePage + accept-invite route

**Files:**
- Create: `D:\CODE\startica\app\src\modules\auth\pages\AcceptInvitePage.vue`
- Create: `D:\CODE\startica\app\src\pages\accept-invite.vue`

**How it works:**
- Supabase's `detectSessionInUrl: true` (default) auto-exchanges the `?code=` from the invite link before the component mounts.
- The page calls `authStore.fetchCurrentUser()` on mount to ensure the store has the session.
- If no user after that call → redirect to `/login`.
- Otherwise → show "set your password" form using the existing `updatePasswordSchema`.
- On success → redirect to `/`.

- [ ] **Step 1: Create AcceptInvitePage.vue**

Create `D:\CODE\startica\app\src\modules\auth\pages\AcceptInvitePage.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref, reactive } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { updatePasswordSchema, type UpdatePasswordInput } from '~/shared/schemas/auth.schema'

const { t } = useI18n()
const authStore = useAuthStore()
const { updatePassword, loading } = useAuth()

const ready = ref(false)
const state = reactive<Partial<UpdatePasswordInput>>({ password: undefined, confirmPassword: undefined })

onMounted(async () => {
  // Supabase auto-exchanges the invite ?code= before this runs.
  // fetchCurrentUser() ensures the resulting session is applied to the store.
  if (!authStore.user) {
    await authStore.fetchCurrentUser()
  }
  if (!authStore.user) {
    await navigateTo('/login')
    return
  }
  ready.value = true
})

async function onSubmit(event: FormSubmitEvent<UpdatePasswordInput>) {
  const ok = await updatePassword(event.data.password)
  if (ok) {
    await navigateTo('/')
  }
}
</script>

<template>
  <UCard class="w-full max-w-md">
    <template #header>
      <AuthCardHeader :title="t('auth.acceptInvite.title')" />
    </template>

    <p v-if="!ready" class="text-sm text-neutral-500">{{ t('common.loading') }}</p>

    <UForm
      v-else
      :schema="updatePasswordSchema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <p class="text-sm text-neutral-600">{{ t('auth.acceptInvite.subtitle') }}</p>

      <UFormField :label="t('auth.newPassword')" name="password">
        <UInput v-model="state.password" type="password" class="w-full" />
      </UFormField>

      <UFormField :label="t('auth.confirmPassword')" name="confirmPassword">
        <UInput v-model="state.confirmPassword" type="password" class="w-full" />
      </UFormField>

      <UButton type="submit" color="primary" block loading-auto :loading="loading">
        {{ t('auth.resetPasswordSubmit') }}
      </UButton>
    </UForm>
  </UCard>
</template>
```

- [ ] **Step 2: Create the route file**

Create `D:\CODE\startica\app\src\pages\accept-invite.vue`:

```vue
<script setup lang="ts">
import AcceptInvitePage from '~/modules/auth/pages/AcceptInvitePage.vue'

definePageMeta({ layout: 'auth', public: true })
</script>

<template>
  <AcceptInvitePage />
</template>
```

- [ ] **Step 3: Run the unit tests**

Run: `cd "D:/CODE/startica/app" && npm run test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/modules/auth/pages/AcceptInvitePage.vue src/pages/accept-invite.vue
git commit -m "feat(auth): add AcceptInvitePage for invite link password setup"
```

---

### Task 8: StaffListPage + staff route

**Files:**
- Create: `D:\CODE\startica\app\src\modules\staff\pages\StaffListPage.vue`
- Create: `D:\CODE\startica\app\src\pages\staff.vue`

**Behaviour summary:**
- If `tenantStore.selectedKindergartenId === 'ALL'` → show "select a kindergarten" empty state; no table, no invite button.
- Otherwise: fetch staff on mount and whenever the selected kindergarten changes (watch `selectedKindergartenId`).
- Table: Name · Email · Role badge · Status badge · Actions (Edit, Deactivate/Reactivate, Remove).
- Edit modal: `fullName` field (all roles); `role` dropdown only shown when caller is `super_admin`.
- Deactivate / Reactivate: confirm modal — text changes based on current status.
- Remove: confirm modal.
- Invite modal: `email`, `fullName`, `role` (Super Admin: admin + educator; Admin: educator only, field locked).

**Role badge colors:** `primary` for `admin`, `neutral` for `educator`, `error` for `super_admin`.
**Status badge colors:** `success` for `active`, `neutral` for `inactive`.

- [ ] **Step 1: Create StaffListPage.vue**

Create `D:\CODE\startica\app\src\modules\staff\pages\StaffListPage.vue`:

```vue
<script setup lang="ts">
import { h, reactive, ref, computed, onMounted, watch } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { FormSubmitEvent } from '@nuxt/ui'
import {
  inviteStaffSchema,
  updateStaffSchema,
  type InviteStaffInput,
  type UpdateStaffInput,
} from '~/shared/schemas/staff.schema'
import type { StaffMember } from '../types/staff.types'

const { t } = useI18n()
const toast = useToast()
const { can } = usePermissions()
const { user } = useAuth()
const tenantStore = useTenantStore()
const { items, loading, fetchAll, invite, updateProfile, setStatus, remove } = useStaff()

const selectedKgId = computed(() => tenantStore.selectedKindergartenId)

async function loadStaff() {
  if (selectedKgId.value !== 'ALL') {
    await fetchAll(selectedKgId.value)
  }
}

onMounted(loadStaff)
watch(selectedKgId, loadStaff)

// ── Invite modal ───────────────────────────────────────────────────────────
const inviteModalOpen = ref(false)
const inviteState = reactive<Partial<InviteStaffInput>>({
  email: undefined,
  fullName: undefined,
  role: 'educator',
  kindergartenId: undefined,
})

function openInvite() {
  inviteState.email = undefined
  inviteState.fullName = undefined
  inviteState.role = 'educator'
  inviteState.kindergartenId = selectedKgId.value !== 'ALL' ? selectedKgId.value : undefined
  inviteModalOpen.value = true
}

const roleOptions = computed(() => {
  if (user.value?.role === 'super_admin') {
    return [
      { label: t('staff.role.admin'), value: 'admin' },
      { label: t('staff.role.educator'), value: 'educator' },
    ]
  }
  return [{ label: t('staff.role.educator'), value: 'educator' }]
})

async function onInviteSubmit(event: FormSubmitEvent<InviteStaffInput>) {
  const ok = await invite(event.data)
  if (ok) {
    inviteModalOpen.value = false
    toast.add({ title: t('staff.inviteSuccess'), color: 'success' })
  }
}

// ── Edit modal ─────────────────────────────────────────────────────────────
const editModalOpen = ref(false)
const editTarget = ref<StaffMember | null>(null)
const editState = reactive<Partial<UpdateStaffInput>>({})

function openEdit(member: StaffMember) {
  editTarget.value = member
  editState.fullName = member.fullName
  editState.role = member.role
  editModalOpen.value = true
}

async function onEditSubmit(event: FormSubmitEvent<UpdateStaffInput>) {
  if (!editTarget.value) return
  const data: UpdateStaffInput = { fullName: event.data.fullName }
  // Only super_admin can change roles — omit the field otherwise
  if (user.value?.role === 'super_admin' && event.data.role) {
    data.role = event.data.role
  }
  const ok = await updateProfile(editTarget.value.id, data)
  if (ok) {
    editModalOpen.value = false
    toast.add({ title: t('staff.updateSuccess'), color: 'success' })
  }
}

// ── Status confirm modal ───────────────────────────────────────────────────
const statusModalOpen = ref(false)
const statusTarget = ref<StaffMember | null>(null)

function openStatusConfirm(member: StaffMember) {
  statusTarget.value = member
  statusModalOpen.value = true
}

const statusConfirmTitle = computed(() =>
  statusTarget.value?.status === 'active'
    ? t('staff.confirmDeactivateTitle')
    : t('staff.confirmReactivateTitle'),
)
const statusConfirmBody = computed(() =>
  statusTarget.value?.status === 'active'
    ? t('staff.confirmDeactivateBody')
    : t('staff.confirmReactivateBody'),
)

async function onStatusConfirm() {
  if (!statusTarget.value) return
  const nextStatus = statusTarget.value.status === 'active' ? 'inactive' : 'active'
  const ok = await setStatus(statusTarget.value.id, nextStatus)
  if (ok) {
    statusModalOpen.value = false
    const msg = nextStatus === 'inactive' ? t('staff.deactivateSuccess') : t('staff.reactivateSuccess')
    toast.add({ title: msg, color: 'success' })
  }
}

// ── Remove confirm modal ───────────────────────────────────────────────────
const removeModalOpen = ref(false)
const removeTarget = ref<StaffMember | null>(null)

function openRemoveConfirm(member: StaffMember) {
  removeTarget.value = member
  removeModalOpen.value = true
}

async function onRemoveConfirm() {
  if (!removeTarget.value || selectedKgId.value === 'ALL') return
  const ok = await remove(removeTarget.value.id, selectedKgId.value)
  if (ok) {
    removeModalOpen.value = false
    toast.add({ title: t('staff.removeSuccess'), color: 'success' })
  }
}

// ── Table columns ──────────────────────────────────────────────────────────
const roleBadgeColor = (role: StaffMember['role']): 'error' | 'primary' | 'neutral' => {
  if (role === 'super_admin') return 'error'
  if (role === 'admin') return 'primary'
  return 'neutral'
}

const columns = computed<TableColumn<StaffMember>[]>(() => [
  { accessorKey: 'fullName', header: t('staff.table.name') },
  { accessorKey: 'email', header: t('staff.table.email') },
  {
    accessorKey: 'role',
    header: t('staff.table.role'),
    cell: ({ row }) =>
      h(
        resolveComponent('UBadge'),
        { color: roleBadgeColor(row.original.role), variant: 'soft' },
        () => t(`staff.role.${row.original.role}`),
      ),
  },
  {
    accessorKey: 'status',
    header: t('staff.table.status'),
    cell: ({ row }) =>
      h(
        resolveComponent('UBadge'),
        { color: row.original.status === 'active' ? 'success' : 'neutral', variant: 'soft' },
        () => t(`staff.status.${row.original.status}`),
      ),
  },
  {
    id: 'actions',
    header: t('staff.table.actions'),
    cell: ({ row }) =>
      h('div', { class: 'flex gap-2' }, [
        can('update', 'staff')
          ? h(
              resolveComponent('UButton'),
              { size: 'xs', color: 'neutral', variant: 'soft', onClick: () => openEdit(row.original) },
              () => t('common.edit'),
            )
          : null,
        can('update', 'staff')
          ? h(
              resolveComponent('UButton'),
              { size: 'xs', color: 'neutral', variant: 'soft', onClick: () => openStatusConfirm(row.original) },
              () => row.original.status === 'active' ? t('staff.deactivate') : t('staff.reactivate'),
            )
          : null,
        can('delete', 'staff')
          ? h(
              resolveComponent('UButton'),
              { size: 'xs', color: 'error', variant: 'soft', onClick: () => openRemoveConfirm(row.original) },
              () => t('staff.remove'),
            )
          : null,
      ]),
  },
])
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-xl font-semibold text-neutral-800">{{ t('staff.pageTitle') }}</h1>
      <UButton v-if="can('create', 'staff') && selectedKgId !== 'ALL'" color="primary" @click="openInvite">
        {{ t('staff.invite') }}
      </UButton>
    </div>

    <p v-if="selectedKgId === 'ALL'" class="text-sm text-neutral-500">
      {{ t('staff.selectKindergarten') }}
    </p>

    <UTable v-else :data="items" :columns="columns" :loading="loading">
      <template #empty>
        <p class="py-8 text-center text-sm text-neutral-500">{{ t('staff.empty') }}</p>
      </template>
    </UTable>

    <!-- Invite modal -->
    <UModal v-model:open="inviteModalOpen">
      <template #header>
        <h2 class="text-lg font-semibold">{{ t('staff.inviteTitle') }}</h2>
      </template>
      <template #body>
        <UForm :schema="inviteStaffSchema" :state="inviteState" class="space-y-4" @submit="onInviteSubmit">
          <UFormField :label="t('staff.email')" name="email">
            <UInput v-model="inviteState.email" type="email" class="w-full" />
          </UFormField>
          <UFormField :label="t('staff.name')" name="fullName">
            <UInput v-model="inviteState.fullName" class="w-full" />
          </UFormField>
          <UFormField :label="t('staff.role')" name="role">
            <USelect v-model="inviteState.role" :items="roleOptions" class="w-full" />
          </UFormField>
          <UButton type="submit" color="primary" block loading-auto :loading="loading">
            {{ t('staff.invite') }}
          </UButton>
        </UForm>
      </template>
    </UModal>

    <!-- Edit modal -->
    <UModal v-model:open="editModalOpen">
      <template #header>
        <h2 class="text-lg font-semibold">{{ t('staff.editTitle') }}</h2>
      </template>
      <template #body>
        <UForm :schema="updateStaffSchema" :state="editState" class="space-y-4" @submit="onEditSubmit">
          <UFormField :label="t('staff.name')" name="fullName">
            <UInput v-model="editState.fullName" class="w-full" />
          </UFormField>
          <UFormField v-if="user?.role === 'super_admin'" :label="t('staff.role')" name="role">
            <USelect
              v-model="editState.role"
              :items="[
                { label: t('staff.role.super_admin'), value: 'super_admin' },
                { label: t('staff.role.admin'), value: 'admin' },
                { label: t('staff.role.educator'), value: 'educator' },
              ]"
              class="w-full"
            />
          </UFormField>
          <UButton type="submit" color="primary" loading-auto :loading="loading">
            {{ t('common.save') }}
          </UButton>
        </UForm>
      </template>
    </UModal>

    <!-- Status confirm modal -->
    <UModal v-model:open="statusModalOpen">
      <template #header>
        <h2 class="text-lg font-semibold">{{ statusConfirmTitle }}</h2>
      </template>
      <template #body>
        <p class="text-sm text-neutral-600">{{ statusConfirmBody }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <UButton color="neutral" variant="soft" @click="statusModalOpen = false">
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="primary" loading-auto :loading="loading" @click="onStatusConfirm">
            {{ t('staff.confirm') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Remove confirm modal -->
    <UModal v-model:open="removeModalOpen">
      <template #header>
        <h2 class="text-lg font-semibold">{{ t('staff.confirmRemoveTitle') }}</h2>
      </template>
      <template #body>
        <p class="text-sm text-neutral-600">{{ t('staff.confirmRemoveBody') }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <UButton color="neutral" variant="soft" @click="removeModalOpen = false">
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="error" loading-auto :loading="loading" @click="onRemoveConfirm">
            {{ t('staff.remove') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 2: Create the route file**

Create `D:\CODE\startica\app\src\pages\staff.vue`:

```vue
<script setup lang="ts">
import StaffListPage from '~/modules/staff/pages/StaffListPage.vue'

definePageMeta({ layout: 'admin', middleware: ['role'], roles: ['super_admin', 'admin'] })
</script>

<template>
  <StaffListPage />
</template>
```

- [ ] **Step 3: Run typecheck**

Run: `cd "D:/CODE/startica/app" && npx vue-tsc --noEmit`
Expected: exit code 0. Fix any TypeScript errors before proceeding.

- [ ] **Step 4: Run full test suite + build**

Run: `cd "D:/CODE/startica/app" && npm run test && npm run build`
Expected: all tests pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/modules/staff/pages/StaffListPage.vue src/pages/staff.vue
git commit -m "feat(staff): add StaffListPage and /staff route"
```

---

### Task 9: Playwright e2e tests + final verification

**Files:**
- Create: `D:\CODE\startica\app\tests\e2e\staff.spec.ts`

**Prerequisites:** local Supabase stack must be running (`npx supabase status`). If not, run `npx supabase start` first.

**Seeded data used by the tests:**
- Super Admin: `admin@startica.dev` / `Startica123!`
- Admin: `admin.demo@startica.dev` / `Startica123!`
- Educator: `educator.demo@startica.dev` / `Startica123!`
- Kindergarten: `Grădinița Zâna Florilor` (id `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`)
- Seeded staff at that kindergarten: `Maria Ionescu` (admin) + `Elena Popescu` (educator)

The tenant selector must show `Grădinița Zâna Florilor` as an option after the kindergartens load. Super Admin defaults to "ALL" so they must select the kindergarten manually before the staff list shows.

- [ ] **Step 1: Write the e2e tests**

Create `D:\CODE\startica\app\tests\e2e\staff.spec.ts`:

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

test.describe('staff', () => {
  test('super admin selects a kindergarten and sees the staff list', async ({ page }) => {
    await login(page, 'admin@startica.dev')

    await page.getByRole('link', { name: 'Personal' }).click()
    await expect(page).toHaveURL('http://localhost:3000/staff')

    // With no kindergarten selected, the prompt is shown
    await expect(page.getByText('Selectează o grădiniță pentru a vedea personalul.')).toBeVisible()

    // Select the kindergarten from the tenant selector
    await page.locator('select, [role="combobox"]').first().click()
    await page.getByRole('option', { name: 'Grădinița Zâna Florilor' }).click()

    // Seeded staff should appear
    await expect(page.getByRole('cell', { name: 'Maria Ionescu' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Elena Popescu' })).toBeVisible()
  })

  test('super admin can invite a new educator, deactivate, and reactivate', async ({ page }) => {
    await login(page, 'admin@startica.dev')
    await page.getByRole('link', { name: 'Personal' }).click()

    // Select kindergarten
    await page.locator('select, [role="combobox"]').first().click()
    await page.getByRole('option', { name: 'Grădinița Zâna Florilor' }).click()
    await expect(page.getByRole('cell', { name: 'Elena Popescu' })).toBeVisible()

    // Invite a new educator with a timestamp-unique email
    const uniqueEmail = `test-educator-${Date.now()}@example.com`
    await page.getByRole('button', { name: 'Invită' }).click()
    await page.getByLabel('Email').fill(uniqueEmail)
    await page.getByLabel('Nume complet').fill('Educator Nou')
    await page.getByRole('button', { name: 'Invită' }).last().click()
    await expect(page.getByText('Invitația a fost trimisă.', { exact: true })).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('cell', { name: 'Educator Nou' })).toBeVisible()

    // Deactivate Elena Popescu
    const elenaRow = page.getByRole('row', { name: /Elena Popescu/ })
    await elenaRow.getByRole('button', { name: 'Dezactivează' }).click()
    await page.getByRole('button', { name: 'Confirmă' }).click()
    await expect(elenaRow.getByText('Inactiv')).toBeVisible()

    // Reactivate Elena Popescu
    await elenaRow.getByRole('button', { name: 'Reactivează' }).click()
    await page.getByRole('button', { name: 'Confirmă' }).click()
    await expect(elenaRow.getByText('Activ')).toBeVisible()
  })

  test('an educator is redirected away from /staff', async ({ page }) => {
    await login(page, 'educator.demo@startica.dev')
    await page.goto('/staff')
    await expect(page).toHaveURL('http://localhost:3000/')
  })
})
```

- [ ] **Step 2: Verify Supabase is running**

Run: `npx supabase status`
Expected: all services report running. If not, run `npx supabase start` first.

- [ ] **Step 3: Run the e2e tests**

Run: `cd "D:/CODE/startica/app" && npm run test:e2e`
Expected: 8 passed (5 existing auth + kindergartens + 3 new staff tests). If a selector doesn't match — e.g. the tenant USelect renders differently than `[role="combobox"]` — inspect `playwright-report/index.html` with `--headed` flag and fix the selector in `staff.spec.ts` before continuing.

- [ ] **Step 4: Full final verification**

Run in order:

```bash
cd "D:/CODE/startica/app"
npm run build
npx vue-tsc --noEmit
npm run test
npm run test:e2e
```

Expected: all four succeed with exit code 0.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/staff.spec.ts
git commit -m "test(staff): add Playwright e2e coverage for the staff flow"
```
