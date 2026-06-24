# Auth Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working login/logout/forgot-password/reset-password flows against the local Supabase stack, with route guards that redirect unauthenticated users to `/login` and authenticated users away from guest-only pages.

**Architecture:** `Component → composable (useAuth) → Pinia store (auth.store) → service (auth.service) → Supabase Auth`. Route protection is a global middleware (`auth.global.ts`) plus an opt-in named middleware (`role.ts`), both thin re-exports of real logic in `core/middleware/`. Redirect *decisions* are pure functions, unit-tested without any Nuxt runtime; the Nuxt-specific wiring (`defineNuxtRouteMiddleware`, `navigateTo`) is exercised by Playwright instead.

**Tech Stack:** Nuxt 3.21, Pinia (`pinia` + `@pinia/nuxt` — new), Zod v4 (already installed), `@supabase/ssr` (already installed), Nuxt UI v3.3.7 (`UForm`/`UFormField`/`UInput`/`UButton`/`UAlert`/`UCard`), Vitest (new), Playwright (`@playwright/test`, new).

## Global Constraints

- Zod v4 syntax: use `z.email()` (top-level), not the deprecated `z.string().email()`.
- `supabase/config.toml` → `minimum_password_length = 6`. The reset-password schema must use `min(6)`, not an invented stricter value.
- `auth.service.ts` is the only file that calls `client.auth.*` or `client.from('users')` — every other file goes through it.
- No hardcoded user-facing strings — every label/message goes through `useI18n()` and a key in both `ro.json` and `en.json`.
- Modules never import from each other directly; `src/pages/*.vue` and `src/middleware/*.ts` are Nuxt routing/middleware plumbing (not "modules"), so they may import from `modules/auth/`.
- Never leak whether an email exists: login errors and forgot-password results both show one generic message regardless of cause.
- Seeded local demo login (from the foundation migration/seed): `admin@startica.dev` / `Startica123!`.

---

### Task 1: Pinia + Vitest infra

**Files:**
- Modify: `D:\CODE\startica\app\package.json` (add deps, add `test`/`test:watch` scripts)
- Modify: `D:\CODE\startica\app\nuxt.config.ts` (add `@pinia/nuxt` to `modules`)
- Create: `D:\CODE\startica\app\vitest.config.ts`

**Interfaces:**
- Produces: a working `npm run test` command and a `~`/`@` → `src/` alias usable from any `*.test.ts` file under `src/`.

- [ ] **Step 1: Install Pinia and Vitest**

```bash
cd "D:/CODE/startica/app"
npm install pinia @pinia/nuxt
npm install -D vitest
```

- [ ] **Step 2: Register the Pinia module**

In `nuxt.config.ts`, change:

```ts
  modules: ['@nuxt/ui', '@nuxtjs/i18n'],
```

to:

```ts
  modules: ['@nuxt/ui', '@nuxtjs/i18n', '@pinia/nuxt'],
```

- [ ] **Step 3: Create the Vitest config**

Create `D:\CODE\startica\app\vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

- [ ] **Step 4: Add test scripts to package.json**

In `package.json`, add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 5: Verify Vitest runs with zero test files (no failure, just a notice)**

Run: `cd "D:/CODE/startica/app" && npm run test`
Expected: Vitest starts, reports "No test files found" (or similar), exits non-zero only because there are no tests yet — that's expected at this point; confirm there is no *configuration* error (e.g. no alias/resolve error, no crash). If Vitest errors out about config rather than "no tests", fix the config before continuing.

- [ ] **Step 6: Verify the Nuxt build still passes with Pinia registered**

Run: `cd "D:/CODE/startica/app" && npm run build`
Expected: build completes with `✨ Build complete!`, no errors about `@pinia/nuxt`.

- [ ] **Step 7: Commit**

(No git repo exists in this project yet — skip `git commit`; just leave the working tree as-is. If a git repo gets initialized later, this and every subsequent "Commit" step should be done together at that point.)

---

### Task 2: Context-aware Supabase client + page-meta typing

**Files:**
- Modify: `D:\CODE\startica\app\src\core\supabase\client.ts`
- Create: `D:\CODE\startica\app\src\shared\types\page-meta.d.ts`

**Interfaces:**
- Consumes: `createSupabaseBrowserClient`, `createSupabaseServerClient` (already exist in `client.ts` from the foundation pass).
- Produces: `useSupabaseClient(): SupabaseClient<Database>` — picks the server or browser client depending on `import.meta.server`/`import.meta.client`. Every later task that needs a Supabase client uses this, not the two lower-level factories directly.
- Produces: ambient `definePageMeta({ public, guestOnly, roles })` typing usable from any page.

- [ ] **Step 1: Add `useSupabaseClient()` to `client.ts`**

Open `D:\CODE\startica\app\src\core\supabase\client.ts` and add this export at the end of the file (after the existing `createSupabaseAdminClient`):

```ts
/**
 * Picks the right Supabase client for the current execution context.
 * Use this everywhere instead of calling the two factories above directly —
 * middleware and stores run during SSR (server) and during client-side
 * navigation (browser), and the two contexts need different clients.
 */
export function useSupabaseClient() {
  if (import.meta.server) {
    const event = useRequestEvent()
    if (!event) {
      throw new Error('useSupabaseClient() called server-side without a request event')
    }
    return createSupabaseServerClient(event)
  }

  return createSupabaseBrowserClient()
}
```

- [ ] **Step 2: Add the page-meta type augmentation**

Create `D:\CODE\startica\app\src\shared\types\page-meta.d.ts`:

```ts
import type { Database } from '~/core/supabase/types'

type UserRole = Database['public']['Enums']['user_role']

declare module '#app' {
  interface PageMeta {
    /** Page is reachable without an authenticated session. */
    public?: boolean
    /** Authenticated users are redirected away from this page (e.g. /login). */
    guestOnly?: boolean
    /** If set, only these roles may view the page (role.ts middleware). */
    roles?: UserRole[]
  }
}

export {}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd "D:/CODE/startica/app" && npx nuxi typecheck`
Expected: exit code 0, no errors about `useSupabaseClient` or `PageMeta`.

- [ ] **Step 4: Commit** (skipped — no git repo; see Task 1 Step 7 note)

---

### Task 3: Auth types + Zod schemas (TDD)

**Files:**
- Create: `D:\CODE\startica\app\src\modules\auth\types\auth.types.ts`
- Create: `D:\CODE\startica\app\src\shared\schemas\auth.schema.ts`
- Test: `D:\CODE\startica\app\src\shared\schemas\auth.schema.test.ts`

**Interfaces:**
- Produces: `AuthUser` (id, email, fullName, role, avatarUrl, status), `loginSchema`, `requestPasswordResetSchema`, `updatePasswordSchema` — consumed by Task 4 (service), Task 5 (store), Task 8/9 (pages).

- [ ] **Step 1: Write the failing tests**

Create `D:\CODE\startica\app\src\shared\schemas\auth.schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loginSchema, requestPasswordResetSchema, updatePasswordSchema } from './auth.schema'

describe('loginSchema', () => {
  it('accepts a valid email and non-empty password', () => {
    const result = loginSchema.safeParse({ email: 'admin@startica.dev', password: 'Startica123!' })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'Startica123!' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({ email: 'admin@startica.dev', password: '' })
    expect(result.success).toBe(false)
  })
})

describe('requestPasswordResetSchema', () => {
  it('accepts a valid email', () => {
    expect(requestPasswordResetSchema.safeParse({ email: 'admin@startica.dev' }).success).toBe(true)
  })

  it('rejects an invalid email', () => {
    expect(requestPasswordResetSchema.safeParse({ email: 'nope' }).success).toBe(false)
  })
})

describe('updatePasswordSchema', () => {
  it('accepts matching passwords of valid length', () => {
    const result = updatePasswordSchema.safeParse({ password: 'newpass1', confirmPassword: 'newpass1' })
    expect(result.success).toBe(true)
  })

  it('rejects mismatched passwords', () => {
    const result = updatePasswordSchema.safeParse({ password: 'newpass1', confirmPassword: 'different' })
    expect(result.success).toBe(false)
  })

  it('rejects passwords shorter than 6 characters', () => {
    const result = updatePasswordSchema.safeParse({ password: 'abc', confirmPassword: 'abc' })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/shared/schemas/auth.schema.test.ts`
Expected: FAIL — `auth.schema.ts` does not exist yet (`Cannot find module './auth.schema'`).

- [ ] **Step 3: Write the schema implementation**

Create `D:\CODE\startica\app\src\shared\schemas\auth.schema.ts`:

```ts
import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export const requestPasswordResetSchema = z.object({
  email: z.email(),
})

export const updatePasswordSchema = z
  .object({
    password: z.string().min(6),
    confirmPassword: z.string().min(6),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'passwordMismatch',
    path: ['confirmPassword'],
  })

export type LoginInput = z.infer<typeof loginSchema>
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/shared/schemas/auth.schema.test.ts`
Expected: PASS — 7 tests passed.

- [ ] **Step 5: Write the auth types (no test needed — type-only file)**

Create `D:\CODE\startica\app\src\modules\auth\types\auth.types.ts`:

```ts
import type { Database } from '~/core/supabase/types'

export type UserRole = Database['public']['Enums']['user_role']
export type UserStatus = Database['public']['Enums']['user_status']

export interface AuthUser {
  id: string
  email: string
  fullName: string
  role: UserRole
  avatarUrl: string | null
  status: UserStatus
}

export interface LoginCredentials {
  email: string
  password: string
}
```

- [ ] **Step 6: Verify typecheck**

Run: `cd "D:/CODE/startica/app" && npx nuxi typecheck`
Expected: exit code 0.

- [ ] **Step 7: Commit** (skipped — no git repo; see Task 1 Step 7 note)

---

### Task 4: Auth service (TDD)

**Files:**
- Create: `D:\CODE\startica\app\src\modules\auth\services\auth.service.ts`
- Test: `D:\CODE\startica\app\src\modules\auth\services\auth.service.test.ts`

**Interfaces:**
- Consumes: `Database` type from `~/core/supabase/types` (Task 3 doesn't touch this file; it already exists from the foundation pass).
- Produces: `AuthResult<T> = { success: true; data: T } | { success: false; error: string }`, and functions `signInWithPassword(client, email, password)`, `signOut(client)`, `requestPasswordReset(client, email, redirectTo)`, `updatePassword(client, password)`, `fetchCurrentUserProfile(client, userId)`, `getCurrentUserId(client): Promise<string | null>` — all take an explicit Supabase client as the first argument (dependency injection, not `useSupabaseClient()` internally) so they're testable with a plain mock object and reusable from both store and any future server route. This file is the only one that ever calls `client.auth.*` or `client.from('users')` — `getCurrentUserId` exists specifically so `auth.store.ts` doesn't call `client.auth.getUser()` directly. Consumed by Task 5 (store).

- [ ] **Step 1: Write the failing tests**

Create `D:\CODE\startica\app\src\modules\auth\services\auth.service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import {
  signInWithPassword,
  signOut,
  requestPasswordReset,
  updatePassword,
  fetchCurrentUserProfile,
  getCurrentUserId,
} from './auth.service'

function createMockClient(overrides: { auth?: Record<string, unknown> } = {}) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      ...overrides.auth,
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'user-1',
              email: 'a@b.com',
              full_name: 'A B',
              role: 'admin',
              avatar_url: null,
              status: 'active',
            },
            error: null,
          }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('signInWithPassword', () => {
  it('returns success with the user id on valid credentials', async () => {
    const client = createMockClient()
    const result = await signInWithPassword(client, 'a@b.com', 'pw')
    expect(result).toEqual({ success: true, data: { userId: 'user-1' } })
  })

  it('returns failure when Supabase returns an error', async () => {
    const client = createMockClient({
      auth: {
        signInWithPassword: vi
          .fn()
          .mockResolvedValue({ data: { user: null }, error: { message: 'Invalid login credentials' } }),
      },
    })
    const result = await signInWithPassword(client, 'a@b.com', 'wrong')
    expect(result).toEqual({ success: false, error: 'Invalid login credentials' })
  })
})

describe('signOut', () => {
  it('returns success when Supabase signs out cleanly', async () => {
    const client = createMockClient()
    expect(await signOut(client)).toEqual({ success: true, data: null })
  })
})

describe('requestPasswordReset', () => {
  it('calls resetPasswordForEmail with the redirect URL and returns success', async () => {
    const client = createMockClient()
    const result = await requestPasswordReset(client, 'a@b.com', 'http://localhost:3000/reset-password')
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', {
      redirectTo: 'http://localhost:3000/reset-password',
    })
    expect(result).toEqual({ success: true, data: null })
  })
})

describe('updatePassword', () => {
  it('returns success when Supabase updates the password', async () => {
    const client = createMockClient()
    expect(await updatePassword(client, 'newpass1')).toEqual({ success: true, data: null })
  })
})

describe('fetchCurrentUserProfile', () => {
  it('returns the matching public.users row', async () => {
    const client = createMockClient()
    const result = await fetchCurrentUserProfile(client, 'user-1')
    expect(result.success).toBe(true)
  })
})

describe('getCurrentUserId', () => {
  it('returns the user id when a session exists', async () => {
    const client = createMockClient({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    })
    expect(await getCurrentUserId(client)).toBe('user-1')
  })

  it('returns null when there is no session', async () => {
    const client = createMockClient({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    })
    expect(await getCurrentUserId(client)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/modules/auth/services/auth.service.test.ts`
Expected: FAIL — `Cannot find module './auth.service'`.

- [ ] **Step 3: Write the service implementation**

Create `D:\CODE\startica\app\src\modules\auth\services\auth.service.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'

type Client = SupabaseClient<Database>
type UserRow = Database['public']['Tables']['users']['Row']

export type AuthResult<T> = { success: true; data: T } | { success: false; error: string }

export async function signInWithPassword(
  client: Client,
  email: string,
  password: string,
): Promise<AuthResult<{ userId: string }>> {
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    return { success: false, error: error?.message ?? 'unknown_error' }
  }
  return { success: true, data: { userId: data.user.id } }
}

export async function signOut(client: Client): Promise<AuthResult<null>> {
  const { error } = await client.auth.signOut()
  if (error) return { success: false, error: error.message }
  return { success: true, data: null }
}

export async function requestPasswordReset(
  client: Client,
  email: string,
  redirectTo: string,
): Promise<AuthResult<null>> {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) return { success: false, error: error.message }
  return { success: true, data: null }
}

export async function updatePassword(client: Client, password: string): Promise<AuthResult<null>> {
  const { error } = await client.auth.updateUser({ password })
  if (error) return { success: false, error: error.message }
  return { success: true, data: null }
}

export async function fetchCurrentUserProfile(client: Client, userId: string): Promise<AuthResult<UserRow>> {
  const { data, error } = await client.from('users').select('*').eq('id', userId).single()
  if (error || !data) return { success: false, error: error?.message ?? 'not_found' }
  return { success: true, data }
}

export async function getCurrentUserId(client: Client): Promise<string | null> {
  const { data } = await client.auth.getUser()
  return data.user?.id ?? null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/modules/auth/services/auth.service.test.ts`
Expected: PASS — 8 tests passed.

- [ ] **Step 5: Commit** (skipped — no git repo; see Task 1 Step 7 note)

---

### Task 5: Auth store + useAuth composable (TDD)

**Files:**
- Create: `D:\CODE\startica\app\src\modules\auth\stores\auth.store.ts`
- Test: `D:\CODE\startica\app\src\modules\auth\stores\auth.store.test.ts`
- Create: `D:\CODE\startica\app\src\modules\auth\composables\useAuth.ts`

**Interfaces:**
- Consumes: `useSupabaseClient` (Task 2), `auth.service.ts` exports (Task 4), `AuthUser` (Task 3).
- Produces: `useAuthStore()` Pinia store with state `{ user: AuthUser | null, loading: boolean, error: string | null }`, getter `isAuthenticated`, actions `login(email, password): Promise<boolean>`, `logout(): Promise<void>`, `fetchCurrentUser(): Promise<void>`, `requestPasswordReset(email): Promise<boolean>`, `updatePassword(password): Promise<boolean>`. Produces `useAuth()` composable wrapping the store — consumed by Task 6 (middleware) and Task 8/9 (pages).

- [ ] **Step 1: Write the failing tests**

Create `D:\CODE\startica\app\src\modules\auth\stores\auth.store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('~/core/supabase/client', () => ({
  useSupabaseClient: () => ({}),
}))

vi.mock('../services/auth.service')

import { useAuthStore } from './auth.store'
import * as authService from '../services/auth.service'

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('sets the user and isAuthenticated on successful login', async () => {
    vi.mocked(authService.signInWithPassword).mockResolvedValue({
      success: true,
      data: { userId: 'user-1' },
    })
    vi.mocked(authService.fetchCurrentUserProfile).mockResolvedValue({
      success: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { id: 'user-1', email: 'a@b.com', full_name: 'A B', role: 'admin', avatar_url: null, status: 'active' } as any,
    })

    const store = useAuthStore()
    const result = await store.login('a@b.com', 'pw')

    expect(result).toBe(true)
    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.fullName).toBe('A B')
  })

  it('sets an error and stays unauthenticated on invalid credentials', async () => {
    vi.mocked(authService.signInWithPassword).mockResolvedValue({
      success: false,
      error: 'Invalid login credentials',
    })

    const store = useAuthStore()
    const result = await store.login('a@b.com', 'wrong')

    expect(result).toBe(false)
    expect(store.isAuthenticated).toBe(false)
    expect(store.error).toBe('Invalid login credentials')
  })

  it('clears the user on logout', async () => {
    vi.mocked(authService.signOut).mockResolvedValue({ success: true, data: null })

    const store = useAuthStore()
    store.user = { id: 'user-1', email: 'a@b.com', fullName: 'A B', role: 'admin', avatarUrl: null, status: 'active' }

    await store.logout()

    expect(store.user).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/modules/auth/stores/auth.store.test.ts`
Expected: FAIL — `Cannot find module './auth.store'`.

- [ ] **Step 3: Write the store implementation**

Create `D:\CODE\startica\app\src\modules\auth\stores\auth.store.ts`:

```ts
import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import type { Database } from '~/core/supabase/types'
import * as authService from '../services/auth.service'
import type { AuthUser } from '../types/auth.types'

type UserRow = Database['public']['Tables']['users']['Row']

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    avatarUrl: row.avatar_url,
    status: row.status,
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthUser | null,
    loading: false,
    error: null as string | null,
  }),

  getters: {
    isAuthenticated: (state) => state.user !== null,
  },

  actions: {
    async login(email: string, password: string) {
      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const signInResult = await authService.signInWithPassword(client, email, password)
      if (!signInResult.success) {
        this.loading = false
        this.error = signInResult.error
        return false
      }

      const profileResult = await authService.fetchCurrentUserProfile(client, signInResult.data.userId)
      this.loading = false
      if (!profileResult.success) {
        this.error = profileResult.error
        return false
      }

      this.user = toAuthUser(profileResult.data)
      return true
    },

    async logout() {
      const client = useSupabaseClient()
      await authService.signOut(client)
      this.user = null
    },

    async fetchCurrentUser() {
      const client = useSupabaseClient()
      const userId = await authService.getCurrentUserId(client)

      if (!userId) {
        this.user = null
        return
      }

      const profileResult = await authService.fetchCurrentUserProfile(client, userId)
      this.user = profileResult.success ? toAuthUser(profileResult.data) : null
    },

    async requestPasswordReset(email: string) {
      this.loading = true
      this.error = null
      const client = useSupabaseClient()
      const redirectTo = `${window.location.origin}/reset-password`
      const result = await authService.requestPasswordReset(client, email, redirectTo)
      this.loading = false
      if (!result.success) this.error = result.error
      return result.success
    },

    async updatePassword(password: string) {
      this.loading = true
      this.error = null
      const client = useSupabaseClient()
      const result = await authService.updatePassword(client, password)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }
      return true
    },
  },
})
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/modules/auth/stores/auth.store.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Write the `useAuth` composable (thin wrapper — no dedicated test, covered by the store tests above and by Playwright in Task 10)**

Create `D:\CODE\startica\app\src\modules\auth\composables\useAuth.ts`:

```ts
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth.store'

export function useAuth() {
  const store = useAuthStore()

  return {
    user: computed(() => store.user),
    isAuthenticated: computed(() => store.isAuthenticated),
    loading: computed(() => store.loading),
    error: computed(() => store.error),
    login: (email: string, password: string) => store.login(email, password),
    logout: () => store.logout(),
    requestPasswordReset: (email: string) => store.requestPasswordReset(email),
    updatePassword: (password: string) => store.updatePassword(password),
  }
}
```

- [ ] **Step 6: Verify typecheck and full test suite**

Run: `cd "D:/CODE/startica/app" && npx nuxi typecheck && npm run test`
Expected: typecheck exit 0; all Vitest suites so far (schema, service, store) pass.

- [ ] **Step 7: Commit** (skipped — no git repo; see Task 1 Step 7 note)

---

### Task 6: Middleware (pure redirect logic, TDD) + Nuxt wiring

**Files:**
- Create: `D:\CODE\startica\app\src\core\middleware\auth-redirect.ts`
- Test: `D:\CODE\startica\app\src\core\middleware\auth-redirect.test.ts`
- Create: `D:\CODE\startica\app\src\core\middleware\role-redirect.ts`
- Test: `D:\CODE\startica\app\src\core\middleware\role-redirect.test.ts`
- Create: `D:\CODE\startica\app\src\core\middleware\auth.ts`
- Create: `D:\CODE\startica\app\src\core\middleware\role.ts`
- Create: `D:\CODE\startica\app\src\middleware\auth.global.ts`
- Create: `D:\CODE\startica\app\src\middleware\role.ts`

**Interfaces:**
- Consumes: `useAuthStore` (Task 5).
- Produces: `resolveAuthRedirect(input): string | null`, `resolveRoleRedirect(userRole, allowedRoles): string | null` — pure functions, no Nuxt globals, fully unit-tested here. The two `core/middleware/*.ts` files wrap them with `defineNuxtRouteMiddleware`; the two `src/middleware/*.ts` files are bare re-exports so Nuxt's file-based middleware discovery picks them up.

- [ ] **Step 1: Write the failing test for the auth redirect logic**

Create `D:\CODE\startica\app\src\core\middleware\auth-redirect.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveAuthRedirect } from './auth-redirect'

describe('resolveAuthRedirect', () => {
  it('allows authenticated users through to a protected route', () => {
    expect(
      resolveAuthRedirect({ isAuthenticated: true, isPublic: false, isGuestOnly: false, fullPath: '/' }),
    ).toBeNull()
  })

  it('redirects unauthenticated users to login with a redirect param', () => {
    expect(
      resolveAuthRedirect({ isAuthenticated: false, isPublic: false, isGuestOnly: false, fullPath: '/children' }),
    ).toBe('/login?redirect=%2Fchildren')
  })

  it('lets unauthenticated users reach public routes', () => {
    expect(
      resolveAuthRedirect({ isAuthenticated: false, isPublic: true, isGuestOnly: false, fullPath: '/login' }),
    ).toBeNull()
  })

  it('redirects authenticated users away from guest-only routes', () => {
    expect(
      resolveAuthRedirect({ isAuthenticated: true, isPublic: true, isGuestOnly: true, fullPath: '/login' }),
    ).toBe('/')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/core/middleware/auth-redirect.test.ts`
Expected: FAIL — `Cannot find module './auth-redirect'`.

- [ ] **Step 3: Implement `auth-redirect.ts`**

Create `D:\CODE\startica\app\src\core\middleware\auth-redirect.ts`:

```ts
export interface AuthRedirectInput {
  isAuthenticated: boolean
  isPublic: boolean
  isGuestOnly: boolean
  fullPath: string
}

export function resolveAuthRedirect(input: AuthRedirectInput): string | null {
  if (input.isGuestOnly && input.isAuthenticated) {
    return '/'
  }
  if (!input.isPublic && !input.isAuthenticated) {
    return `/login?redirect=${encodeURIComponent(input.fullPath)}`
  }
  return null
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/core/middleware/auth-redirect.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Write the failing test for the role redirect logic**

Create `D:\CODE\startica\app\src\core\middleware\role-redirect.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveRoleRedirect } from './role-redirect'

describe('resolveRoleRedirect', () => {
  it('allows any role through when no roles are required', () => {
    expect(resolveRoleRedirect('educator', undefined)).toBeNull()
  })

  it('allows a user whose role is in the allowed list', () => {
    expect(resolveRoleRedirect('admin', ['admin', 'super_admin'])).toBeNull()
  })

  it('redirects a user whose role is not in the allowed list', () => {
    expect(resolveRoleRedirect('educator', ['admin', 'super_admin'])).toBe('/')
  })

  it('redirects when there is no user at all', () => {
    expect(resolveRoleRedirect(null, ['admin'])).toBe('/')
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/core/middleware/role-redirect.test.ts`
Expected: FAIL — `Cannot find module './role-redirect'`.

- [ ] **Step 7: Implement `role-redirect.ts`**

Create `D:\CODE\startica\app\src\core\middleware\role-redirect.ts`:

```ts
export function resolveRoleRedirect(userRole: string | null, allowedRoles: string[] | undefined): string | null {
  if (!allowedRoles || allowedRoles.length === 0) return null
  if (!userRole || !allowedRoles.includes(userRole)) return '/'
  return null
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `cd "D:/CODE/startica/app" && npx vitest run src/core/middleware/role-redirect.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 9: Wire the real Nuxt middleware (no unit test — exercised by Playwright in Task 10)**

Create `D:\CODE\startica\app\src\core\middleware\auth.ts`:

```ts
import { resolveAuthRedirect } from './auth-redirect'

export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore()

  if (!authStore.user && !authStore.loading) {
    await authStore.fetchCurrentUser()
  }

  const redirect = resolveAuthRedirect({
    isAuthenticated: authStore.isAuthenticated,
    isPublic: to.meta.public === true,
    isGuestOnly: to.meta.guestOnly === true,
    fullPath: to.fullPath,
  })

  if (redirect) {
    return navigateTo(redirect)
  }
})
```

Create `D:\CODE\startica\app\src\core\middleware\role.ts`:

```ts
import { resolveRoleRedirect } from './role-redirect'

export default defineNuxtRouteMiddleware((to) => {
  const authStore = useAuthStore()
  const redirect = resolveRoleRedirect(authStore.user?.role ?? null, to.meta.roles as string[] | undefined)

  if (redirect) {
    return navigateTo(redirect)
  }
})
```

- [ ] **Step 10: Add the Nuxt-discoverable thin re-exports**

Create `D:\CODE\startica\app\src\middleware\auth.global.ts`:

```ts
export { default } from '~/core/middleware/auth'
```

Create `D:\CODE\startica\app\src\middleware\role.ts`:

```ts
export { default } from '~/core/middleware/role'
```

- [ ] **Step 11: Verify typecheck and full test suite**

Run: `cd "D:/CODE/startica/app" && npx nuxi typecheck && npm run test`
Expected: typecheck exit 0; all Vitest suites pass (schema, service, store, auth-redirect, role-redirect — 17 tests total).

- [ ] **Step 12: Commit** (skipped — no git repo; see Task 1 Step 7 note)

---

### Task 7: i18n keys + `auth` layout + language switcher

**Files:**
- Modify: `D:\CODE\startica\app\src\core\i18n\locales\ro.json`
- Modify: `D:\CODE\startica\app\src\core\i18n\locales\en.json`
- Create: `D:\CODE\startica\app\src\shared\ui\LanguageSwitcher.vue`
- Create: `D:\CODE\startica\app\src\layouts\auth.vue`

**Interfaces:**
- Produces: `auth.*` i18n keys consumed by Task 8/9 pages. Produces `<LanguageSwitcher />` (auto-imported component, since `~/shared/ui` is already in `components.dirs`). Produces the `auth` layout, selected via `definePageMeta({ layout: 'auth' })` in Task 8/9's thin route pages.

- [ ] **Step 1: Add the new `auth.*` keys to `ro.json`**

Replace the `"auth"` block in `D:\CODE\startica\app\src\core\i18n\locales\ro.json`:

```json
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
    }
  }
```

- [ ] **Step 2: Add the matching keys to `en.json`**

Replace the `"auth"` block in `D:\CODE\startica\app\src\core\i18n\locales\en.json`:

```json
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
    }
  }
```

- [ ] **Step 3: Create the language switcher**

Create `D:\CODE\startica\app\src\shared\ui\LanguageSwitcher.vue`:

```vue
<script setup lang="ts">
const { locale, setLocale } = useI18n()
</script>

<template>
  <div class="flex gap-2 text-sm">
    <button
      type="button"
      :class="locale === 'ro' ? 'font-semibold text-teal-600' : 'text-neutral-500 hover:text-teal-600'"
      @click="setLocale('ro')"
    >
      RO
    </button>
    <button
      type="button"
      :class="locale === 'en' ? 'font-semibold text-teal-600' : 'text-neutral-500 hover:text-teal-600'"
      @click="setLocale('en')"
    >
      EN
    </button>
  </div>
</template>
```

- [ ] **Step 4: Create the `auth` layout**

Create `D:\CODE\startica\app\src\layouts\auth.vue`:

```vue
<template>
  <div class="flex min-h-screen items-center justify-center bg-app-bg px-4">
    <slot />
  </div>
</template>
```

- [ ] **Step 5: Verify build**

Run: `cd "D:/CODE/startica/app" && npm run build`
Expected: `✨ Build complete!`, no i18n JSON parse errors.

- [ ] **Step 6: Commit** (skipped — no git repo; see Task 1 Step 7 note)

---

### Task 8: Login page + protected home placeholder

**Files:**
- Create: `D:\CODE\startica\app\src\modules\auth\pages\LoginPage.vue`
- Create: `D:\CODE\startica\app\src\pages\login.vue`
- Modify: `D:\CODE\startica\app\src\pages\index.vue`

**Interfaces:**
- Consumes: `useAuth()` (Task 5), `loginSchema` (Task 3), `LanguageSwitcher` (Task 7), `auth` layout (Task 7).

- [ ] **Step 1: Write `LoginPage.vue`**

Create `D:\CODE\startica\app\src\modules\auth\pages\LoginPage.vue`:

```vue
<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { loginSchema, type LoginInput } from '~/shared/schemas/auth.schema'

const { t } = useI18n()
const { login, loading, error } = useAuth()
const route = useRoute()

const state = reactive<Partial<LoginInput>>({ email: undefined, password: undefined })

async function onSubmit(event: FormSubmitEvent<LoginInput>) {
  const ok = await login(event.data.email, event.data.password)
  if (ok) {
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await navigateTo(redirect)
  }
}
</script>

<template>
  <UCard class="w-full max-w-md">
    <template #header>
      <p class="text-xl font-semibold text-teal-700">Startica</p>
      <h1 class="text-lg font-semibold text-neutral-800">{{ t('auth.loginTitle') }}</h1>
    </template>

    <UAlert v-if="error" color="error" variant="soft" :title="t('auth.invalidCredentials')" class="mb-4" />

    <UForm :schema="loginSchema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField :label="t('auth.email')" name="email">
        <UInput v-model="state.email" type="email" class="w-full" />
      </UFormField>

      <UFormField :label="t('auth.password')" name="password">
        <UInput v-model="state.password" type="password" class="w-full" />
      </UFormField>

      <UButton type="submit" color="primary" block loading-auto :loading="loading">
        {{ t('auth.submit') }}
      </UButton>
    </UForm>

    <template #footer>
      <div class="flex items-center justify-between text-sm">
        <NuxtLink to="/forgot-password" class="text-teal-600 hover:text-teal-700">
          {{ t('auth.forgotPassword') }}
        </NuxtLink>
        <LanguageSwitcher />
      </div>
    </template>
  </UCard>
</template>
```

- [ ] **Step 2: Write the thin route file**

Create `D:\CODE\startica\app\src\pages\login.vue`:

```vue
<script setup lang="ts">
import LoginPage from '~/modules/auth/pages/LoginPage.vue'

definePageMeta({ layout: 'auth', public: true, guestOnly: true })
</script>

<template>
  <LoginPage />
</template>
```

- [ ] **Step 3: Update the protected home placeholder**

Replace `D:\CODE\startica\app\src\pages\index.vue`:

```vue
<script setup lang="ts">
const { t } = useI18n()
const { user, logout } = useAuth()

async function onLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-app-bg">
    <UCard class="w-full max-w-sm text-center">
      <p class="text-neutral-800">
        {{ t('auth.welcomeBack', { name: user?.fullName }) }}
      </p>
      <p class="mt-1 text-sm text-neutral-500">
        {{ user ? t(`auth.role.${user.role}`) : '' }}
      </p>
      <UButton class="mt-4" color="primary" variant="soft" @click="onLogout">
        {{ t('auth.logout') }}
      </UButton>
    </UCard>
  </div>
</template>
```

(No `definePageMeta` here — it's protected by default, since `auth.global.ts` redirects to `/login` unless `to.meta.public === true`.)

- [ ] **Step 4: Verify build and typecheck**

Run: `cd "D:/CODE/startica/app" && npm run build && npx nuxi typecheck`
Expected: both succeed.

- [ ] **Step 5: Manual smoke test against the local Supabase stack**

Make sure the local stack is running (`npx supabase status` — if not, `npx supabase start`), then:

Run: `cd "D:/CODE/startica/app" && npm run dev`

Open `http://localhost:3000/` in a browser — expect a redirect to `http://localhost:3000/login?redirect=%2F`. Log in with `admin@startica.dev` / `Startica123!` — expect a redirect back to `/` showing "Salut, Super Admin" and a "Super Admin" role label. Click "Deconectare" — expect a redirect to `/login`. Stop the dev server (Ctrl+C) when done.

- [ ] **Step 6: Commit** (skipped — no git repo; see Task 1 Step 7 note)

---

### Task 9: Forgot-password + reset-password pages

**Files:**
- Create: `D:\CODE\startica\app\src\modules\auth\pages\ForgotPasswordPage.vue`
- Create: `D:\CODE\startica\app\src\pages\forgot-password.vue`
- Create: `D:\CODE\startica\app\src\modules\auth\pages\ResetPasswordPage.vue`
- Create: `D:\CODE\startica\app\src\pages\reset-password.vue`

**Interfaces:**
- Consumes: `useAuth()` (Task 5), `requestPasswordResetSchema`/`updatePasswordSchema` (Task 3), `LanguageSwitcher`/`auth` layout (Task 7).

- [ ] **Step 1: Write `ForgotPasswordPage.vue`**

Create `D:\CODE\startica\app\src\modules\auth\pages\ForgotPasswordPage.vue`:

```vue
<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { requestPasswordResetSchema, type RequestPasswordResetInput } from '~/shared/schemas/auth.schema'

const { t } = useI18n()
const { requestPasswordReset, loading } = useAuth()

const state = reactive<Partial<RequestPasswordResetInput>>({ email: undefined })
const submitted = ref(false)

async function onSubmit(event: FormSubmitEvent<RequestPasswordResetInput>) {
  await requestPasswordReset(event.data.email)
  // Always show the same success state, regardless of the result — never
  // reveal whether the email exists in the system.
  submitted.value = true
}
</script>

<template>
  <UCard class="w-full max-w-md">
    <template #header>
      <p class="text-xl font-semibold text-teal-700">Startica</p>
      <h1 class="text-lg font-semibold text-neutral-800">{{ t('auth.forgotPasswordTitle') }}</h1>
    </template>

    <UAlert v-if="submitted" color="success" variant="soft" :title="t('auth.forgotPasswordSuccess')" />

    <UForm v-else :schema="requestPasswordResetSchema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField :label="t('auth.email')" name="email">
        <UInput v-model="state.email" type="email" class="w-full" />
      </UFormField>

      <UButton type="submit" color="primary" block loading-auto :loading="loading">
        {{ t('auth.forgotPasswordSubmit') }}
      </UButton>
    </UForm>

    <template #footer>
      <div class="flex items-center justify-between text-sm">
        <NuxtLink to="/login" class="text-teal-600 hover:text-teal-700">
          {{ t('auth.backToLogin') }}
        </NuxtLink>
        <LanguageSwitcher />
      </div>
    </template>
  </UCard>
</template>
```

- [ ] **Step 2: Write the thin route file**

Create `D:\CODE\startica\app\src\pages\forgot-password.vue`:

```vue
<script setup lang="ts">
import ForgotPasswordPage from '~/modules/auth/pages/ForgotPasswordPage.vue'

definePageMeta({ layout: 'auth', public: true, guestOnly: true })
</script>

<template>
  <ForgotPasswordPage />
</template>
```

- [ ] **Step 3: Write `ResetPasswordPage.vue`**

Create `D:\CODE\startica\app\src\modules\auth\pages\ResetPasswordPage.vue`:

```vue
<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { updatePasswordSchema, type UpdatePasswordInput } from '~/shared/schemas/auth.schema'

const { t } = useI18n()
const { isAuthenticated, updatePassword, loading } = useAuth()

const state = reactive<Partial<UpdatePasswordInput>>({ password: undefined, confirmPassword: undefined })
const success = ref(false)

async function onSubmit(event: FormSubmitEvent<UpdatePasswordInput>) {
  const ok = await updatePassword(event.data.password)
  if (ok) {
    success.value = true
    await navigateTo('/')
  }
}
</script>

<template>
  <UCard class="w-full max-w-md">
    <template #header>
      <p class="text-xl font-semibold text-teal-700">Startica</p>
      <h1 class="text-lg font-semibold text-neutral-800">{{ t('auth.resetPasswordTitle') }}</h1>
    </template>

    <UAlert
      v-if="!isAuthenticated && !success"
      color="error"
      variant="soft"
      :title="t('auth.resetPasswordInvalidLink')"
    />

    <UForm v-else-if="!success" :schema="updatePasswordSchema" :state="state" class="space-y-4" @submit="onSubmit">
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

- [ ] **Step 4: Write the thin route file**

Create `D:\CODE\startica\app\src\pages\reset-password.vue`:

```vue
<script setup lang="ts">
import ResetPasswordPage from '~/modules/auth/pages/ResetPasswordPage.vue'

definePageMeta({ layout: 'auth', public: true })
</script>

<template>
  <ResetPasswordPage />
</template>
```

- [ ] **Step 5: Verify build and typecheck**

Run: `cd "D:/CODE/startica/app" && npm run build && npx nuxi typecheck`
Expected: both succeed.

- [ ] **Step 6: Commit** (skipped — no git repo; see Task 1 Step 7 note)

---

### Task 10: Playwright e2e tests + final verification

**Files:**
- Create: `D:\CODE\startica\app\playwright.config.ts`
- Create: `D:\CODE\startica\app\tests\e2e\auth.spec.ts`
- Modify: `D:\CODE\startica\app\package.json` (add `test:e2e` script)
- Modify: `D:\CODE\startica\app\.gitignore` (ignore `test-results/`, `playwright-report/`)

**Interfaces:**
- Consumes: the full login/logout/forgot-password flow built in Tasks 5–9, against the seeded local Supabase stack (`admin@startica.dev` / `Startica123!`).

- [ ] **Step 1: Install Playwright and its browser**

```bash
cd "D:/CODE/startica/app"
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create the Playwright config**

Create `D:\CODE\startica\app\playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
```

- [ ] **Step 3: Write the e2e test**

Create `D:\CODE\startica\app\tests\e2e\auth.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('auth', () => {
  test('redirects an unauthenticated visitor to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login\?redirect=%2F$/)
  })

  test('logs in, lands on the home placeholder, then logs out', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('admin@startica.dev')
    await page.getByLabel('Parolă').or(page.getByLabel('Password')).fill('Startica123!')
    await page.getByRole('button', { name: /autentificare|log in/i }).click()

    await expect(page).toHaveURL('http://localhost:3000/')
    await expect(page.getByText(/super admin/i)).toBeVisible()

    await page.getByRole('button', { name: /deconectare|log out/i }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('forgot-password always shows the generic success message', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill('does-not-exist@startica.dev')
    await page.getByRole('button', { name: /trimite|send/i }).click()

    await expect(page.getByText(/email cu instrucțiuni|email with reset instructions/i)).toBeVisible()
  })
})
```

- [ ] **Step 4: Add the e2e script and gitignore entries**

In `package.json`, add to `"scripts"`:

```json
    "test:e2e": "playwright test"
```

In `.gitignore`, add:

```
# Playwright
/test-results/
/playwright-report/
```

- [ ] **Step 5: Run the e2e suite**

Make sure the local Supabase stack is running first: `cd "D:/CODE/startica/app" && npx supabase status` (run `npx supabase start` if it isn't).

Run: `cd "D:/CODE/startica/app" && npm run test:e2e`
Expected: 3 passed. If the login test fails on the label selectors, open `playwright-report/index.html` (or run with `--headed`) to see the actual rendered labels and adjust the selectors in `tests/e2e/auth.spec.ts` to match — Nuxt UI's `UFormField label` renders as a `<label>` tied to the input via `for`/`id`, so `getByLabel` should resolve, but exact accessible names can vary by Nuxt UI minor version.

- [ ] **Step 6: Full final verification**

Run, in order:

```bash
cd "D:/CODE/startica/app"
npm run build
npx nuxi typecheck
npm run test
npm run test:e2e
```

Expected: all four succeed with exit code 0.

- [ ] **Step 7: Commit** (skipped — no git repo; see Task 1 Step 7 note)
