# P3 — Legacy Error Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop legacy modules from showing raw database messages or sending an empty actor id, until each module is migrated to `AppError` in spec step 7.

**Architecture:** Add `useLegacyErrorMessage()` next to `useAppErrorMessage()`: it turns a legacy store's error string into translated text, using `errors.refused.<reason>` for known reasons and the generic refusal otherwise. Pool actions return early with the reason `session_expired` instead of sending `''`, and load actions reset `loading` in `finally`. Pages and components route every error string through the new helper. Two unchecked casts in the child profile page become explicit field mappings, and the kindergartens table formats dates in the UI locale.

**Tech Stack:** Nuxt 3.21, Vue 3.5, Pinia 3, vue-i18n 11, Nuxt UI 3, Vitest 4 (+ happy-dom, @vue/test-utils).

**Spec:** Audit report https://claude.ai/code/artifact/ed5a70e1-2e16-43e9-b87b-937cc791489c · roadmap `docs/superpowers/plans/2026-09-14-audit-remediation-roadmap.md` · `.claude/skills/project-conventions/SKILL.md` rule 6.

## Global Constraints

- Conventional Commits; no AI/agent mention; no `Co-Authored-By`.
- Every commit: lint 0 errors, typecheck, `npx vitest run`, build green; gates sequential.
- Do not touch `src/modules/settings/**` (P1) or `src/modules/expenses/**` (P2).
- Component and composable tests that use vue-i18n run under `// @vitest-environment happy-dom` and pass both `en` and `ro` messages to `createI18n` (the project's message typing requires both locales).
- Never render a raw Supabase/Postgres message.

## File Structure

- Modify `src/shared/composables/useAppErrorMessage.ts` — add `useLegacyErrorMessage`.
- Create `src/shared/composables/useAppErrorMessage.test.ts`.
- Modify `src/modules/pool/stores/pool.store.ts` — actor guard, `finally`, `@core` alias.
- Create `src/modules/pool/stores/pool.store.test.ts`.
- Modify `src/modules/pool/pages/PoolTrainerSettingsPage.vue`, `PoolCalendarPage.vue`, `src/modules/pool/components/PoolAvailabilityEditor.vue`, `PoolPatternList.vue`.
- Modify `src/modules/children/pages/ChildProfilePage.vue`, `ChildrenListPage.vue`, `src/modules/groups/pages/GroupDetailPage.vue`, `GroupsListPage.vue`, `src/modules/dashboard/pages/DashboardPage.vue`, `AuditLogPage.vue`, `src/modules/staff/components/ModuleAssignmentPanel.vue`.
- Modify `src/shared/composables/useLocaleFormat.ts` — add `formatTimestampDate`; create `src/shared/composables/useLocaleFormat.test.ts`.
- Modify `src/modules/kindergartens/pages/KindergartensListPage.vue:107`.

## Setup (once)

```powershell
$repo = "D:\CODE\startica\app"
git -C $repo fetch origin
git -C $repo worktree add -b fix/legacy-error-display "$repo\.worktrees\legacy-error-display" origin/main
New-Item -ItemType Junction -Path "$repo\.worktrees\legacy-error-display\node_modules" -Target "$repo\node_modules" | Out-Null
```

Run later commands from that worktree; run `npx nuxi prepare` once.

---

### Task 1: `useLegacyErrorMessage`

**Files:**
- Modify: `src/shared/composables/useAppErrorMessage.ts`
- Test: `src/shared/composables/useAppErrorMessage.test.ts`

**Interfaces:**
- Produces: `useLegacyErrorMessage(): (reason: string | null | undefined) => string`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { useAppErrorMessage, useLegacyErrorMessage } from './useAppErrorMessage'

const messages = {
  errors: {
    network: 'Could not reach the server.',
    refused: { rejected: 'The operation was rejected.', session_expired: 'Your session has expired.' },
  },
}

function withI18n<T>(composable: () => T): T {
  let captured: T | undefined
  const host = defineComponent({
    setup() {
      captured = composable()
      return () => null
    },
  })
  const i18n = createI18n<false>({ legacy: false, locale: 'en', messages: { en: messages, ro: messages } })
  mount(host, { global: { plugins: [i18n] } })
  return captured as T
}

describe('useAppErrorMessage', () => {
  it('translates an AppError through its message key', () => {
    const describeAppError = withI18n(() => useAppErrorMessage())

    expect(describeAppError({ kind: 'network' })).toBe('Could not reach the server.')
  })
})

describe('useLegacyErrorMessage', () => {
  it('translates a known refusal reason', () => {
    const describeLegacyError = withI18n(() => useLegacyErrorMessage())

    expect(describeLegacyError('session_expired')).toBe('Your session has expired.')
  })

  it('never shows a raw database message', () => {
    const describeLegacyError = withI18n(() => useLegacyErrorMessage())

    expect(describeLegacyError('duplicate key value violates unique constraint "groups_pkey"')).toBe('The operation was rejected.')
  })

  it('falls back to the generic refusal when no reason is set', () => {
    const describeLegacyError = withI18n(() => useLegacyErrorMessage())

    expect(describeLegacyError(null)).toBe('The operation was rejected.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/composables/useAppErrorMessage.test.ts`
Expected: FAIL — `useLegacyErrorMessage` is not exported.

- [ ] **Step 3: Write the implementation** — append to `src/shared/composables/useAppErrorMessage.ts`:

```ts
// Legacy stores hold a reason code or a raw database message as a string until they move to AppError.
export function useLegacyErrorMessage() {
  const { t, te } = useI18n()

  return function describeLegacyError(reason: string | null | undefined): string {
    const messageKey = `errors.refused.${reason}`
    return reason && te(messageKey) ? t(messageKey) : t('errors.refused.rejected')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/composables/useAppErrorMessage.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/composables/useAppErrorMessage.ts src/shared/composables/useAppErrorMessage.test.ts
git commit -m "feat(shared): translate legacy store errors without showing database text"
```

---

### Task 2: Pool store — actor guard and loading reset

**Files:**
- Modify: `src/modules/pool/stores/pool.store.ts` (full replacement)
- Test: `src/modules/pool/stores/pool.store.test.ts`

**Interfaces:**
- Consumes: `useActorStore().actorId: string | null`; `poolService.*` functions (unchanged signatures).
- Produces: pool mutations return `false` and set `error = 'session_expired'` when nobody is signed in; `fetchAvailability`, `fetchPatterns`, `fetchSessions` always reset `loading`.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@core/supabase/client', () => ({ useSupabaseClient: () => ({}) }))
vi.mock('../services/pool.service')

import { useActorStore } from '@shared/session/actor.store'
import * as poolService from '../services/pool.service'
import { usePoolStore } from './pool.store'

const availabilityInput = {
  kindergartenId: 'kg-1',
  trainerUserId: 'user-1',
  weekday: 1,
  startTime: '09:00',
  endTime: '10:00',
} as Parameters<typeof poolService.addAvailability>[1]

describe('pool store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('refuses a change with session_expired when nobody is signed in', async () => {
    const store = usePoolStore()

    await expect(store.addAvailability(availabilityInput)).resolves.toBe(false)

    expect(store.error).toBe('session_expired')
    expect(poolService.addAvailability).not.toHaveBeenCalled()
  })

  it('sends the signed-in actor id with a change', async () => {
    useActorStore().setActor({ id: 'user-1', email: 'e@b.com', fullName: 'Trainer', role: 'educator', avatarUrl: null, status: 'active' })
    vi.mocked(poolService.addAvailability).mockResolvedValue({ success: true, data: { id: 'availability-1' } as never })
    const store = usePoolStore()

    await expect(store.addAvailability(availabilityInput)).resolves.toBe(true)

    expect(poolService.addAvailability).toHaveBeenCalledWith({}, availabilityInput, 'user-1')
  })

  it('stops loading when fetching sessions throws', async () => {
    vi.mocked(poolService.listSessions).mockRejectedValue(new Error('network down'))
    const store = usePoolStore()

    await expect(store.fetchSessions('kg-1')).rejects.toThrow('network down')

    expect(store.loading).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/pool/stores/pool.store.test.ts`
Expected: FAIL — first test gets `true`/service called with `''`; third test leaves `loading` `true`.

- [ ] **Step 3: Replace `src/modules/pool/stores/pool.store.ts` with:**

```ts
import { defineStore } from 'pinia'
import { useSupabaseClient } from '@core/supabase/client'
import { useActorStore } from '@shared/session/actor.store'
import * as poolService from '../services/pool.service'
import type { TrainerAvailability, SchedulePattern, PoolSession, SessionParticipant } from '../types/pool.types'

export const usePoolStore = defineStore('pool', {
  state: () => ({
    availability: [] as TrainerAvailability[],
    patterns: [] as SchedulePattern[],
    sessions: [] as PoolSession[],
    participants: {} as Record<string, SessionParticipant[]>,
    loading: false,
    error: null as string | null,
  }),
  actions: {
    signedInActorId(): string | null {
      const actorId = useActorStore().actorId
      if (!actorId) this.error = 'session_expired'
      return actorId
    },
    async fetchAvailability(kindergartenId: string, trainerUserId: string) {
      this.loading = true
      this.error = null
      try {
        const result = await poolService.listAvailability(useSupabaseClient(), kindergartenId, trainerUserId)
        if (!result.success) { this.error = result.error; return }
        this.availability = result.data
      }
      finally {
        this.loading = false
      }
    },
    async addAvailability(input: Parameters<typeof poolService.addAvailability>[1]) {
      const actorId = this.signedInActorId()
      if (!actorId) return false
      const result = await poolService.addAvailability(useSupabaseClient(), input, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.availability.push(result.data)
      return true
    },
    async removeAvailability(id: string) {
      const actorId = this.signedInActorId()
      if (!actorId) return false
      const result = await poolService.removeAvailability(useSupabaseClient(), id, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.availability = this.availability.filter(a => a.id !== id)
      return true
    },
    async fetchPatterns(kindergartenId: string, trainerUserId?: string) {
      this.loading = true
      this.error = null
      try {
        const result = await poolService.listPatterns(useSupabaseClient(), kindergartenId, trainerUserId)
        if (!result.success) { this.error = result.error; return }
        this.patterns = result.data
      }
      finally {
        this.loading = false
      }
    },
    async createPattern(input: Parameters<typeof poolService.createPattern>[1]) {
      const actorId = this.signedInActorId()
      if (!actorId) return false
      const result = await poolService.createPattern(useSupabaseClient(), input, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.patterns.push(result.data)
      return true
    },
    async deletePattern(id: string) {
      const actorId = this.signedInActorId()
      if (!actorId) return false
      const result = await poolService.deletePattern(useSupabaseClient(), id, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.patterns = this.patterns.filter(p => p.id !== id)
      return true
    },
    async fetchSessions(kindergartenId: string) {
      this.loading = true
      this.error = null
      try {
        const result = await poolService.listSessions(useSupabaseClient(), kindergartenId)
        if (!result.success) { this.error = result.error; return }
        this.sessions = result.data
      }
      finally {
        this.loading = false
      }
    },
    async cancelSession(id: string) {
      const actorId = this.signedInActorId()
      if (!actorId) return false
      const result = await poolService.cancelSession(useSupabaseClient(), id, actorId)
      if (!result.success) { this.error = result.error; return false }
      const idx = this.sessions.findIndex(s => s.id === id)
      if (idx !== -1) this.sessions[idx]!.status = 'cancelled'
      return true
    },
    async fetchParticipants(sessionId: string) {
      const result = await poolService.listParticipants(useSupabaseClient(), sessionId)
      if (!result.success) { this.error = result.error; return }
      this.participants[sessionId] = result.data
    },
    async addParticipant(sessionId: string, childId: string) {
      const actorId = this.signedInActorId()
      if (!actorId) return false
      const result = await poolService.addParticipant(useSupabaseClient(), sessionId, childId, actorId)
      if (!result.success) { this.error = result.error; return false }
      if (!this.participants[sessionId]) this.participants[sessionId] = []
      this.participants[sessionId]!.push(result.data)
      const session = this.sessions.find(s => s.id === sessionId)
      if (session) session.participantCount += 1
      return true
    },
    async removeParticipant(sessionId: string, participantId: string) {
      const actorId = this.signedInActorId()
      if (!actorId) return false
      const result = await poolService.removeParticipant(useSupabaseClient(), participantId, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.participants[sessionId] = (this.participants[sessionId] ?? []).filter(p => p.id !== participantId)
      const session = this.sessions.find(s => s.id === sessionId)
      if (session) session.participantCount -= 1
      return true
    },
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/pool`
Expected: PASS (new 3 tests + existing `pool.service.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/modules/pool/stores/pool.store.ts src/modules/pool/stores/pool.store.test.ts
git commit -m "fix(pool): refuse changes without a signed-in actor and always stop loading"
```

---

### Task 3: Pool pages and components

**Files:**
- Modify: `src/modules/pool/pages/PoolTrainerSettingsPage.vue:11-12,26`
- Modify: `src/modules/pool/pages/PoolCalendarPage.vue:1-8,64`
- Modify: `src/modules/pool/components/PoolAvailabilityEditor.vue:1-10,56`
- Modify: `src/modules/pool/components/PoolPatternList.vue:1-15,71`

**Interfaces:**
- Consumes: `useLegacyErrorMessage` from Task 1.

- [ ] **Step 1: Trainer settings page — never pass an empty trainer id**

Replace:
```ts
const trainerUserId = computed(() => actorStore.actorId ?? '')
const canEdit = computed((): boolean => selectedKgId.value ? canManagePoolTrainer(selectedKgId.value, trainerUserId.value) : false)
```
with:
```ts
const trainerUserId = computed(() => actorStore.actorId)
const canEdit = computed((): boolean =>
  selectedKgId.value && trainerUserId.value ? canManagePoolTrainer(selectedKgId.value, trainerUserId.value) : false)
```

Replace `<template v-if="selectedKgId">` with `<template v-if="selectedKgId && trainerUserId">`.

- [ ] **Step 2: Route error text through the helper in the three pool views**

In each of `PoolCalendarPage.vue`, `PoolAvailabilityEditor.vue`, `PoolPatternList.vue`, add after the last `import` line of `<script setup>` (for `PoolCalendarPage.vue`, after `import { computed, ref } from 'vue'`):

```ts
import { useLegacyErrorMessage } from '@shared/composables/useAppErrorMessage'
```

and after `const { t } = useI18n()`:

```ts
const describeLegacyError = useLegacyErrorMessage()
```

Then replace in each file:
```html
<UAlert v-if="error" color="error" variant="soft" :description="error" />
```
with:
```html
<UAlert v-if="error" color="error" variant="soft" :description="describeLegacyError(error)" />
```

- [ ] **Step 3: Verify**

Run: `grep -rn ':description="error"' src/modules/pool` → no output.
Run: `npx vitest run src/modules/pool && npm run lint && npm run typecheck`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/modules/pool/pages src/modules/pool/components
git commit -m "fix(pool): show translated errors and wait for the signed-in trainer"
```

---

### Task 4: Children, groups, dashboard and staff error text

**Files:**
- Modify: `src/modules/children/pages/ChildProfilePage.vue:84,117,135,155`
- Modify: `src/modules/children/pages/ChildrenListPage.vue:310`
- Modify: `src/modules/groups/pages/GroupDetailPage.vue:76`
- Modify: `src/modules/groups/pages/GroupsListPage.vue:154`
- Modify: `src/modules/dashboard/pages/DashboardPage.vue:53`
- Modify: `src/modules/dashboard/pages/AuditLogPage.vue:29`
- Modify: `src/modules/staff/components/ModuleAssignmentPanel.vue:94`

- [ ] **Step 1: Add the helper to each of the seven files**

In every file above add, after the last `import` line of `<script setup>` (or as the first line inside `<script setup>` when there are no imports):

```ts
import { useLegacyErrorMessage } from '@shared/composables/useAppErrorMessage'
```

and after `const { t } = useI18n()`:

```ts
const describeLegacyError = useLegacyErrorMessage()
```

- [ ] **Step 2: Replace the raw displays**

`ChildProfilePage.vue` — replace:
```ts
      toast.add({ title: childrenStore.error ?? 'update_failed', color: 'error' })
```
with:
```ts
      toast.add({ title: describeLegacyError(childrenStore.error), color: 'error' })
```
and replace all three occurrences of:
```ts
      toast.add({ title: guardiansError.value, color: 'error' })
```
with:
```ts
      toast.add({ title: describeLegacyError(guardiansError.value), color: 'error' })
```

`GroupDetailPage.vue` — replace:
```ts
    toast.add({ title: groupsStore.error ?? 'update_failed', color: 'error' })
```
with:
```ts
    toast.add({ title: describeLegacyError(groupsStore.error), color: 'error' })
```

`ChildrenListPage.vue` — replace `:description="error" class="mb-4"` with `:description="describeLegacyError(error)" class="mb-4"`.

`GroupsListPage.vue`, `DashboardPage.vue`, `AuditLogPage.vue`, `ModuleAssignmentPanel.vue` — replace `:description="error"` with `:description="describeLegacyError(error)"`.

- [ ] **Step 3: Verify no raw display remains anywhere in legacy modules**

Run:
```bash
grep -rn ':description="error"\|title: [a-zA-Z.]*[Ee]rror\b\|title: result.error\|title: [a-zA-Z]*Store.error\|title: [a-zA-Z]*Error.value' src/modules --include=*.vue | grep -v "describeAppError\|describeLegacyError\|t('"
```
Expected: only `src/modules/settings/pages/SettingsPage.vue:160` if P1 is not merged yet; nothing otherwise.

- [ ] **Step 4: Gates and commit**

```bash
npx vitest run && npm run lint && npm run typecheck
git add src/modules/children/pages src/modules/groups/pages src/modules/dashboard/pages src/modules/staff/components/ModuleAssignmentPanel.vue
git commit -m "fix(modules): show translated errors instead of database text in legacy pages"
```

---

### Task 5: Child profile — explicit form mapping

**Files:**
- Modify: `src/modules/children/pages/ChildProfilePage.vue:74-77,122-125,128,146`

**Interfaces:**
- Consumes: `Child` (`src/modules/children/types/children.types.ts`), `Guardian` (`src/modules/children/types/guardian.types.ts`), `UpdateChildInput` (`src/shared/schemas/children.schema.ts:20-34`), `UpdateGuardianInput` (`src/shared/schemas/guardian.schema.ts:17-26`), `useFormModal<T>().open(values: T)`.

- [ ] **Step 1: Replace `openEdit`**

Replace:
```ts
function openEdit() {
  if (!child.value) return
  editModal.open(child.value as unknown as UpdateChildInput)
}
```
with:
```ts
function openEdit() {
  const current = child.value
  if (!current) return
  editModal.open({
    firstName: current.firstName,
    lastName: current.lastName,
    birthDate: current.birthDate,
    bloodGroup: current.bloodGroup,
    allergies: current.allergies,
    medicalNotes: current.medicalNotes,
    nationalId: current.nationalId,
    idType: current.idType,
    groupId: current.groupId,
    contractNumber: current.contractNumber,
    contractSignedAt: current.contractSignedAt,
    enrollmentStartDate: current.enrollmentStartDate,
  })
}
```

- [ ] **Step 2: Replace `openEditGuardian`**

Replace:
```ts
function openEditGuardian(g: Guardian) {
  editGuardianModal.open(g as unknown as UpdateGuardianInput)
  removeGuardianModal.state.id = g.id
}
```
with:
```ts
function openEditGuardian(guardian: Guardian) {
  editGuardianModal.open({
    firstName: guardian.firstName,
    lastName: guardian.lastName,
    email: guardian.email,
    phone: guardian.phone,
    relationship: guardian.relationship,
    isPrimary: guardian.isPrimary,
    notes: guardian.notes,
  })
  removeGuardianModal.state.id = guardian.id
}
```

- [ ] **Step 3: Drop the redundant casts**

Replace both occurrences of:
```ts
  const guardianId = removeGuardianModal.state.id as string
```
with:
```ts
  const guardianId = removeGuardianModal.state.id
```

- [ ] **Step 4: Verify**

Run: `grep -n "as unknown as\|state.id as string" src/modules/children/pages/ChildProfilePage.vue` → no output.
Run: `npm run typecheck && npx vitest run src/modules/children`
Expected: green. If typecheck reports a relationship type mismatch, the `Guardian['relationship']` union differs from the schema enum — stop and report instead of casting.

- [ ] **Step 5: Commit**

```bash
git add src/modules/children/pages/ChildProfilePage.vue
git commit -m "refactor(children): map profile fields into edit forms instead of casting"
```

---

### Task 6: Kindergarten dates in the UI locale

**Files:**
- Modify: `src/shared/composables/useLocaleFormat.ts`
- Test: `src/shared/composables/useLocaleFormat.test.ts`
- Modify: `src/modules/kindergartens/pages/KindergartensListPage.vue:107`

**Interfaces:**
- Produces: `useLocaleFormat().formatTimestampDate(timestamp: string): string` — day of a `timestamptz` in the viewer's time zone and UI locale.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { useLocaleFormat } from './useLocaleFormat'

function formatIn(locale: 'ro' | 'en') {
  let captured: ReturnType<typeof useLocaleFormat> | undefined
  const host = defineComponent({
    setup() {
      captured = useLocaleFormat()
      return () => null
    },
  })
  mount(host, { global: { plugins: [createI18n<false>({ legacy: false, locale, messages: { en: {}, ro: {} } })] } })
  return captured as ReturnType<typeof useLocaleFormat>
}

// Midday UTC keeps the calendar day the same in every time zone the tests may run in.
const createdAt = '2026-09-14T12:00:00Z'

describe('useLocaleFormat.formatTimestampDate', () => {
  it('formats a timestamp day in Romanian', () => {
    expect(formatIn('ro').formatTimestampDate(createdAt)).toBe('14.09.2026')
  })

  it('formats the same timestamp day in English', () => {
    expect(formatIn('en').formatTimestampDate(createdAt)).toBe('14/09/2026')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/composables/useLocaleFormat.test.ts`
Expected: FAIL — `formatTimestampDate is not a function`.

- [ ] **Step 3: Write the implementation**

In `useLocaleFormat.ts`, add before `return { formatCurrency, formatCalendarDate }`:

```ts
  // timestamptz values are instants: show their day in the viewer's time zone.
  function formatTimestampDate(timestamp: string): string {
    return new Date(timestamp).toLocaleDateString(intlLocale.value)
  }
```

and change the return to:

```ts
  return { formatCurrency, formatCalendarDate, formatTimestampDate }
```

In `KindergartensListPage.vue`, add after `import type { Kindergarten } from '../types/kindergarten.types'`:

```ts
import { useLocaleFormat } from '@shared/composables/useLocaleFormat'
```

add after `const { can } = usePermissions()`:

```ts
const { formatTimestampDate } = useLocaleFormat()
```

and replace:
```ts
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString('ro-RO'),
```
with:
```ts
    cell: ({ row }) => formatTimestampDate(row.original.createdAt),
```

- [ ] **Step 4: Run tests and gates**

```bash
npx vitest run
npm run lint
npm run typecheck
npm run build
```
Expected: all green.

- [ ] **Step 5: Commit, push, PR**

```bash
git add src/shared/composables/useLocaleFormat.ts src/shared/composables/useLocaleFormat.test.ts src/modules/kindergartens/pages/KindergartensListPage.vue
git commit -m "fix(kindergartens): format creation dates in the interface language"
git push -u origin fix/legacy-error-display
gh pr create --base main --head fix/legacy-error-display --title "fix(modules): translated errors and signed-in checks in legacy modules" --body "Audit follow-up (P3). Raw database messages no longer reach toasts or alerts in children, groups, dashboard, pool and staff; pool refuses changes without a signed-in actor and always stops loading; child profile edit forms map fields instead of casting; kindergarten creation dates follow the UI language. Manual check: switch the UI to English on /kindergartens; on /pool/settings as an educator with a pool grant, add availability."
```
