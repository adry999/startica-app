# Design Alignment + New Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Groups and Children modules to match the HTML mockups, and build three new features: child profile detail page, group detail page with children list, and guardian contacts.

**Architecture:** Six sequential tasks — DB first, then data layers, then UI. Groups switch from a UTable to a card grid. Child profile and group detail pages use Nuxt's directory-based routing (`pages/groups/index.vue` + `pages/groups/[id].vue`). Guardians live inside `modules/children/` since they are tightly coupled to child records.

**Tech Stack:** Nuxt 3, Vue 3, TypeScript strict, Supabase (Postgres + RLS), Pinia, Tailwind CSS v4 (`@theme` tokens), Nuxt UI v3 (Heroicons via `i-heroicons-*`), @nuxtjs/i18n (RO default + EN)

## Global Constraints

- No hard-DELETE on business data — soft delete via `deleted_at = now()`
- Every read filters `deleted_at IS NULL` in query or RLS
- Every business table has `kindergarten_id`, `created_at`, `updated_at`, `created_by`, `updated_by`
- All fetching via `useLazyAsyncData` wrapping service calls — no raw `$fetch` in components
- Services are the ONLY layer that calls Supabase — stores and components never call the DB
- No hardcoded user-facing strings — everything via `t()` i18n keys
- `usePermissions().can(action, resource)` — never raw `if (role === 'ADMIN')` in components
- Color tokens: mockup `primary` → `teal-600`, `page-bg` → `app-bg`, `ink-700` → `slate-700`, `ink-500` → `slate-500`, `primary-soft` → `teal-50`, `accent-soft` → `brand-yellow/10`, `success` → `success`, `warning` → `warning`
- Icons: Heroicons via `<UIcon name="i-heroicons-{name}" class="h-5 w-5" />` — NOT Material Symbols
- Supabase typed client: `useSupabaseClient<Database>()` from `~/core/supabase/client`
- `Result<T>` from `~/shared/types/result` — all service functions return this
- `useTenantStore().selectedKindergartenId` — UUID or `'ALL'`; queries only filter by kindergartenId when it is not `'ALL'`
- After ANY schema change: new migration file + `supabase gen types typescript --local > src/core/supabase/types.ts`
- No tests (deprioritised for V1 speed)

---

### Task 1: DB Migration — `guardians` table + `groups.capacity`

**Files:**
- Create: `supabase/migrations/20260629100000_add_guardians_and_group_capacity.sql`
- Modify: `src/core/supabase/types.ts` (regenerated — do not hand-edit)

**Interfaces:**
- Produces: `Database['public']['Tables']['guardians']` Row/Insert/Update types; `Database['public']['Tables']['groups']['Row']['capacity']` (integer | null)

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260629100000_add_guardians_and_group_capacity.sql

-- 1. Add capacity column to groups (nullable, set per-group)
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS capacity integer;

-- 2. Create guardians table
CREATE TABLE IF NOT EXISTS public.guardians (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id        uuid        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  kindergarten_id uuid        NOT NULL REFERENCES public.kindergartens(id),
  first_name      text        NOT NULL,
  last_name       text        NOT NULL,
  email           text,
  phone           text,
  relationship    text        NOT NULL DEFAULT 'guardian',
  is_primary      boolean     NOT NULL DEFAULT false,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES public.users(id),
  updated_by      uuid        REFERENCES public.users(id),
  deleted_at      timestamptz
);

-- 3. Enable RLS
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;

-- 4. updated_at trigger — reuse the existing set_updated_at() function
CREATE TRIGGER set_updated_at_guardians
  BEFORE UPDATE ON public.guardians
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. audit_logs trigger — reuse the existing write_audit_log() function
CREATE TRIGGER audit_guardians
  AFTER INSERT OR UPDATE OR DELETE ON public.guardians
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- 6. RLS policies
CREATE POLICY "guardians: read own kindergarten"
  ON public.guardians FOR SELECT TO authenticated
  USING (
    kindergarten_id IN (
      SELECT kindergarten_id FROM public.user_kindergartens WHERE user_id = auth.uid()
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "guardians: insert own kindergarten"
  ON public.guardians FOR INSERT TO authenticated
  WITH CHECK (
    kindergarten_id IN (
      SELECT kindergarten_id FROM public.user_kindergartens WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "guardians: update own kindergarten"
  ON public.guardians FOR UPDATE TO authenticated
  USING (
    kindergarten_id IN (
      SELECT kindergarten_id FROM public.user_kindergartens WHERE user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply the migration locally**

```bash
supabase db reset
```

Expected: "Finished supabase db reset." with no errors.

- [ ] **Step 3: Regenerate TypeScript types**

```bash
supabase gen types typescript --local > src/core/supabase/types.ts
```

Expected: `src/core/supabase/types.ts` updated. Verify it contains `guardians` table definition and `groups` Row has `capacity: number | null`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260629100000_add_guardians_and_group_capacity.sql src/core/supabase/types.ts
git commit -m "feat(db): add guardians table and groups.capacity column"
```

---

### Task 2: Groups Data Layer — capacity + children count

**Files:**
- Modify: `src/modules/groups/types/groups.types.ts`
- Modify: `src/modules/groups/services/groups.service.ts`
- Modify: `src/shared/schemas/groups.schema.ts`
- Modify: `src/modules/groups/stores/groups.store.ts`

**Interfaces:**
- Consumes: `Database['public']['Tables']['groups']['Row']['capacity']` from Task 1
- Produces: `Group` interface with `capacity: number | null` and `childrenCount: number`; `getGroup(client, id)` service function; `createGroup` / `updateGroup` accept `capacity` param

- [ ] **Step 1: Update the Group type**

Replace the entire contents of `src/modules/groups/types/groups.types.ts`:

```typescript
export interface Group {
  id: string
  name: string
  ageRange: string | null
  educatorId: string | null
  educatorName: string | null
  status: 'active' | 'archived'
  kindergartenId: string
  capacity: number | null
  childrenCount: number
}
```

- [ ] **Step 2: Rewrite the groups service**

Replace the entire contents of `src/modules/groups/services/groups.service.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { Group } from '../types/groups.types'

type Client = SupabaseClient<Database>

function toGroup(row: Record<string, unknown>, childrenCount = 0): Group {
  return {
    id: row.id as string,
    name: row.name as string,
    ageRange: (row.age_range as string | null) ?? null,
    educatorId: (row.educator_id as string | null) ?? null,
    educatorName: ((row.users as { full_name: string } | null)?.full_name) ?? null,
    status: row.status as 'active' | 'archived',
    kindergartenId: row.kindergarten_id as string,
    capacity: (row.capacity as number | null) ?? null,
    childrenCount,
  }
}

export async function listGroups(
  client: Client,
  kindergartenId: string,
): Promise<Result<Group[]>> {
  let groupsQ = client
    .from('groups')
    .select('*, users!educator_id(full_name)')
    .is('deleted_at', null)
    .order('name')

  let childrenQ = client
    .from('children')
    .select('group_id')
    .eq('status', 'enrolled')
    .is('deleted_at', null)

  if (kindergartenId !== 'ALL') {
    groupsQ = groupsQ.eq('kindergarten_id', kindergartenId)
    childrenQ = childrenQ.eq('kindergarten_id', kindergartenId)
  }

  const [groupsResult, childrenResult] = await Promise.all([groupsQ, childrenQ])

  if (groupsResult.error) return { success: false, error: groupsResult.error.message }

  const countMap: Record<string, number> = {}
  for (const c of childrenResult.data ?? []) {
    if (c.group_id) countMap[c.group_id] = (countMap[c.group_id] ?? 0) + 1
  }

  return {
    success: true,
    data: (groupsResult.data ?? []).map(r =>
      toGroup(r as Record<string, unknown>, countMap[(r as { id: string }).id] ?? 0),
    ),
  }
}

export async function getGroup(
  client: Client,
  id: string,
): Promise<Result<Group>> {
  const [groupResult, countResult] = await Promise.all([
    client.from('groups').select('*, users!educator_id(full_name)').eq('id', id).single(),
    client
      .from('children')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', id)
      .eq('status', 'enrolled')
      .is('deleted_at', null),
  ])

  if (groupResult.error || !groupResult.data)
    return { success: false, error: groupResult.error?.message ?? 'not_found' }

  return {
    success: true,
    data: toGroup(groupResult.data as Record<string, unknown>, countResult.count ?? 0),
  }
}

export async function createGroup(
  client: Client,
  input: {
    name: string
    ageRange?: string | null
    educatorId?: string | null
    kindergartenId: string
    capacity?: number | null
  },
  actorId: string,
): Promise<Result<Group>> {
  const { data, error } = await client
    .from('groups')
    .insert({
      name: input.name,
      age_range: input.ageRange ?? null,
      educator_id: input.educatorId ?? null,
      kindergarten_id: input.kindergartenId,
      capacity: input.capacity ?? null,
      created_by: actorId,
      updated_by: actorId,
    })
    .select('*, users!educator_id(full_name)')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data: toGroup(data as Record<string, unknown>) }
}

export async function updateGroup(
  client: Client,
  id: string,
  input: {
    name?: string
    ageRange?: string | null
    educatorId?: string | null
    capacity?: number | null
  },
  actorId: string,
): Promise<Result<Group>> {
  const payload: Database['public']['Tables']['groups']['Update'] = { updated_by: actorId }
  if (input.name !== undefined) payload.name = input.name
  if (input.ageRange !== undefined) payload.age_range = input.ageRange
  if (input.educatorId !== undefined) payload.educator_id = input.educatorId
  if (input.capacity !== undefined) payload.capacity = input.capacity

  const { data, error } = await client
    .from('groups')
    .update(payload)
    .eq('id', id)
    .select('*, users!educator_id(full_name)')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data: toGroup(data as Record<string, unknown>) }
}

export async function archiveGroup(
  client: Client,
  id: string,
  actorId: string,
): Promise<Result<void>> {
  const { error } = await client
    .from('groups')
    .update({ status: 'archived', updated_by: actorId })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}

export async function restoreGroup(
  client: Client,
  id: string,
  actorId: string,
): Promise<Result<void>> {
  const { error } = await client
    .from('groups')
    .update({ status: 'active', updated_by: actorId })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}
```

- [ ] **Step 3: Update the groups schema to include capacity**

Replace the entire contents of `src/shared/schemas/groups.schema.ts`:

```typescript
import { z } from 'zod'

export const createGroupSchema = z.object({
  name: z.string().min(1, 'required'),
  ageRange: z.string().nullable().optional(),
  educatorId: z.string().uuid().nullable().optional(),
  kindergartenId: z.string().uuid(),
  capacity: z.coerce.number().int().positive().nullable().optional(),
})
export type CreateGroupInput = z.infer<typeof createGroupSchema>

export const updateGroupSchema = z.object({
  name: z.string().min(1, 'required').optional(),
  ageRange: z.string().nullable().optional(),
  educatorId: z.string().uuid().nullable().optional(),
  capacity: z.coerce.number().int().positive().nullable().optional(),
})
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>
```

- [ ] **Step 4: Update the groups store to preserve childrenCount on update**

Replace the entire contents of `src/modules/groups/stores/groups.store.ts`:

```typescript
import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as groupsService from '../services/groups.service'
import type { Group } from '../types/groups.types'

export const useGroupsStore = defineStore('groups', {
  state: () => ({
    items: [] as Group[],
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async fetchAll(kindergartenId: string) {
      this.loading = true
      this.error = null
      const result = await groupsService.listGroups(useSupabaseClient(), kindergartenId)
      this.loading = false
      if (!result.success) { this.error = result.error; return }
      this.items = result.data
    },
    async create(input: Parameters<typeof groupsService.createGroup>[1]) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await groupsService.createGroup(useSupabaseClient(), input, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.items.unshift(result.data)
      return true
    },
    async update(id: string, input: Parameters<typeof groupsService.updateGroup>[2]) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await groupsService.updateGroup(useSupabaseClient(), id, input, actorId)
      if (!result.success) { this.error = result.error; return false }
      const idx = this.items.findIndex(g => g.id === id)
      if (idx !== -1) {
        // Preserve childrenCount — updateGroup does not re-fetch it
        this.items[idx] = { ...result.data, childrenCount: this.items[idx]!.childrenCount }
      }
      return true
    },
    async archive(id: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await groupsService.archiveGroup(useSupabaseClient(), id, actorId)
      if (!result.success) { this.error = result.error; return false }
      const idx = this.items.findIndex(g => g.id === id)
      if (idx !== -1) this.items[idx]!.status = 'archived'
      return true
    },
    async restore(id: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await groupsService.restoreGroup(useSupabaseClient(), id, actorId)
      if (!result.success) { this.error = result.error; return false }
      const idx = this.items.findIndex(g => g.id === id)
      if (idx !== -1) this.items[idx]!.status = 'active'
      return true
    },
  },
})
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/groups/types/groups.types.ts src/modules/groups/services/groups.service.ts src/shared/schemas/groups.schema.ts src/modules/groups/stores/groups.store.ts
git commit -m "feat(groups): add capacity and childrenCount to Group data layer"
```

---

### Task 3: Groups page redesign + group detail page

**Files:**
- Create: `src/pages/groups/index.vue`
- Delete: `src/pages/groups.vue` (replaced by the above)
- Modify: `src/modules/groups/pages/GroupsListPage.vue` (card grid layout)
- Create: `src/modules/groups/pages/GroupDetailPage.vue`
- Create: `src/pages/groups/[id].vue`
- Modify: `src/core/i18n/locales/ro.json` (add groups.* keys)
- Modify: `src/core/i18n/locales/en.json` (add groups.* keys)

**Interfaces:**
- Consumes: `Group` with `capacity`, `childrenCount` from Task 2; `getGroup()` service; `listChildrenByGroup()` from Task 5 children service

**Why rename `groups.vue` to `groups/index.vue`:** In Nuxt 3, if both `pages/groups.vue` AND `pages/groups/[id].vue` exist, `groups.vue` becomes a layout wrapper that must include `<NuxtPage />` — otherwise `/groups/:id` renders nothing. Using `groups/index.vue` avoids this nesting issue.

- [ ] **Step 1: Add i18n keys to ro.json**

Inside the `"groups"` object in `src/core/i18n/locales/ro.json`, add the following keys (merge with existing keys — do not replace existing ones):

```json
"capacity": "Capacitate",
"viewDetails": "Vezi detalii",
"childrenCount": "{n}/{total} copii",
"fillPercent": "{n}% ocupat",
"stats": {
  "totalGroups": "Total grupe",
  "totalEnrollment": "Total înscriși",
  "educators": "Educatori asignați",
  "totalCapacity": "Capacitate totală"
},
"detail": {
  "title": "Detalii grupă",
  "enrolledChildren": "Copii înscriși",
  "empty": "Niciun copil în această grupă."
}
```

Also add to `"common"`:
```json
"back": "Înapoi"
```

- [ ] **Step 2: Add i18n keys to en.json**

Same structure in `src/core/i18n/locales/en.json`:

Inside `"groups"`:
```json
"capacity": "Capacity",
"viewDetails": "View details",
"childrenCount": "{n}/{total} children",
"fillPercent": "{n}% full",
"stats": {
  "totalGroups": "Total groups",
  "totalEnrollment": "Total enrolled",
  "educators": "Assigned educators",
  "totalCapacity": "Total capacity"
},
"detail": {
  "title": "Group details",
  "enrolledChildren": "Enrolled children",
  "empty": "No children in this group."
}
```

Inside `"common"`:
```json
"back": "Back"
```

- [ ] **Step 3: Create `src/pages/groups/index.vue`**

```vue
<script setup lang="ts">
import GroupsListPage from '~/modules/groups/pages/GroupsListPage.vue'
definePageMeta({ layout: 'admin' })
</script>
<template><GroupsListPage /></template>
```

- [ ] **Step 4: Delete `src/pages/groups.vue`**

```bash
rm src/pages/groups.vue
```

(Or delete the file via file manager — the route `/groups` is now served by `src/pages/groups/index.vue`.)

- [ ] **Step 5: Rewrite `src/modules/groups/pages/GroupsListPage.vue` as card grid**

Replace the entire file:

```vue
<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import {
  createGroupSchema,
  updateGroupSchema,
  type CreateGroupInput,
  type UpdateGroupInput,
} from '~/shared/schemas/groups.schema'
import type { Group } from '../types/groups.types'

const { t } = useI18n()
const toast = useToast()
const { can } = usePermissions()
const tenantStore = useTenantStore()
const { items, loading, error, fetchAll, create, update, archive, restore } = useGroups()
const staffStore = useStaffStore()

const canMutate = computed(() => can('create', 'groups'))
const selectedKgId = computed(() => tenantStore.selectedKindergartenId)

useLazyAsyncData('groups', () => fetchAll(selectedKgId.value), { watch: [selectedKgId] })
useLazyAsyncData(
  'groups-staff',
  () => selectedKgId.value !== 'ALL' ? staffStore.fetchAll(selectedKgId.value) : Promise.resolve(),
  { watch: [selectedKgId] },
)

// ── Tab filter ──────────────────────────────────────────────────────────────
const activeFilter = ref<'all' | 'active' | 'archived'>('active')
const filteredItems = computed(() => {
  if (activeFilter.value === 'active')   return items.value.filter(g => g.status === 'active')
  if (activeFilter.value === 'archived') return items.value.filter(g => g.status === 'archived')
  return items.value
})

// ── Stats ───────────────────────────────────────────────────────────────────
const activeItems     = computed(() => items.value.filter(g => g.status === 'active'))
const totalEnrolled   = computed(() => activeItems.value.reduce((s, g) => s + g.childrenCount, 0))
const educatorsCount  = computed(() => activeItems.value.filter(g => g.educatorId !== null).length)
const totalCapacity   = computed(() => {
  const withCap = activeItems.value.filter(g => g.capacity !== null)
  return withCap.length > 0 ? withCap.reduce((s, g) => s + (g.capacity ?? 0), 0) : null
})

// ── Card accent colors ──────────────────────────────────────────────────────
const STRIPE_CLASSES = [
  'bg-teal-600', 'bg-brand-gold', 'bg-success', 'bg-slate-500', 'bg-teal-400',
] as const

function cardAccentClass(idx: number): string {
  return STRIPE_CLASSES[idx % STRIPE_CLASSES.length] ?? 'bg-teal-600'
}

function fillPercent(group: Group): number {
  if (!group.capacity || group.capacity === 0) return 0
  return Math.round((group.childrenCount / group.capacity) * 100)
}

function fillBarClass(group: Group): string {
  const pct = fillPercent(group)
  if (pct >= 90) return 'bg-error'
  if (pct >= 70) return 'bg-warning'
  return 'bg-teal-600'
}

// ── Educator options ────────────────────────────────────────────────────────
const educatorOptions = computed(() => [
  { label: t('groups.noEducator'), value: null },
  ...staffStore.items
    .filter(s => s.status === 'active' && s.role === 'educator')
    .map(s => ({ label: s.fullName, value: s.id })),
])

// ── Create modal ────────────────────────────────────────────────────────────
const createOpen = ref(false)
const createState = reactive<Partial<CreateGroupInput>>({
  name: undefined, ageRange: null, educatorId: null, capacity: null, kindergartenId: undefined,
})

function openCreate() {
  createState.name = undefined
  createState.ageRange = null
  createState.educatorId = null
  createState.capacity = null
  createState.kindergartenId = selectedKgId.value !== 'ALL' ? selectedKgId.value : undefined
  createOpen.value = true
}

async function onCreateSubmit(event: FormSubmitEvent<CreateGroupInput>) {
  const ok = await create(event.data)
  if (ok) {
    createOpen.value = false
    toast.add({ title: t('groups.createSuccess'), color: 'success' })
  }
}

// ── Edit modal ──────────────────────────────────────────────────────────────
const editOpen   = ref(false)
const editTarget = ref<Group | null>(null)
const editState  = reactive<Partial<UpdateGroupInput>>({})

function openEdit(group: Group) {
  editTarget.value      = group
  editState.name        = group.name
  editState.ageRange    = group.ageRange
  editState.educatorId  = group.educatorId
  editState.capacity    = group.capacity
  editOpen.value        = true
}

async function onEditSubmit(event: FormSubmitEvent<UpdateGroupInput>) {
  if (!editTarget.value) return
  const ok = await update(editTarget.value.id, event.data)
  if (ok) {
    editOpen.value = false
    toast.add({ title: t('groups.updateSuccess'), color: 'success' })
  }
}

// ── Archive / restore ────────────────────────────────────────────────────────
const archiveOpen   = ref(false)
const archiveTarget = ref<Group | null>(null)

function openArchive(group: Group) {
  archiveTarget.value = group
  archiveOpen.value   = true
}

async function onArchiveConfirm() {
  if (!archiveTarget.value) return
  const isArchiving = archiveTarget.value.status === 'active'
  const ok = isArchiving ? await archive(archiveTarget.value.id) : await restore(archiveTarget.value.id)
  if (ok) {
    archiveOpen.value = false
    toast.add({
      title: isArchiving ? t('groups.archiveSuccess') : t('groups.restoreSuccess'),
      color: 'success',
    })
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Page header -->
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-xl font-semibold text-slate-800">{{ t('groups.pageTitle') }}</h1>
        <p class="mt-0.5 text-sm text-slate-400">{{ t('groups.pageSubtitle') }}</p>
      </div>
      <UButton v-if="canMutate && selectedKgId !== 'ALL'" color="primary" @click="openCreate">
        <UIcon name="i-heroicons-plus" class="mr-1.5 h-5 w-5" />
        {{ t('groups.createTitle') }}
      </UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :description="error" />

    <!-- Stats bar -->
    <div v-if="selectedKgId !== 'ALL'" class="grid grid-cols-4 gap-4">
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('groups.stats.totalGroups') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-slate-800">{{ activeItems.length }}</p>
      </div>
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('groups.stats.totalEnrollment') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-teal-600">{{ totalEnrolled }}</p>
      </div>
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('groups.stats.educators') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-slate-800">{{ educatorsCount }}</p>
      </div>
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('groups.stats.totalCapacity') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-slate-800">{{ totalCapacity ?? '—' }}</p>
      </div>
    </div>

    <p v-if="selectedKgId === 'ALL'" class="text-sm text-slate-400">{{ t('staff.selectKindergarten') }}</p>

    <template v-else>
      <!-- Filter tabs -->
      <div class="flex gap-1 border-b border-border">
        <button
          v-for="f in (['active', 'all', 'archived'] as const)"
          :key="f"
          :class="[
            '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            activeFilter === f
              ? 'border-teal-600 text-teal-600'
              : 'border-transparent text-slate-400 hover:text-slate-600',
          ]"
          @click="activeFilter = f"
        >
          {{ t(`groups.filter.${f}`) }}
        </button>
      </div>

      <!-- Loading skeletons -->
      <div v-if="loading" class="grid grid-cols-3 gap-6">
        <div
          v-for="i in 3"
          :key="i"
          class="h-64 animate-pulse rounded-2xl border border-border bg-white"
        />
      </div>

      <!-- Empty state -->
      <div
        v-else-if="filteredItems.length === 0"
        class="rounded-2xl border border-border bg-white py-16 text-center text-sm text-slate-400"
      >
        {{ t('groups.empty') }}
      </div>

      <!-- Card grid -->
      <div v-else class="grid grid-cols-3 gap-6">
        <div
          v-for="(group, idx) in filteredItems"
          :key="group.id"
          class="flex flex-col overflow-hidden rounded-2xl border border-border bg-white"
        >
          <!-- Colored top stripe -->
          <div :class="['h-2 w-full', cardAccentClass(idx)]" />

          <!-- Card body -->
          <div class="flex flex-1 flex-col gap-4 p-6">
            <!-- Name + age range -->
            <div>
              <h4 class="font-semibold text-slate-800">{{ group.name }}</h4>
              <span
                v-if="group.ageRange"
                class="mt-1.5 inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-600"
              >
                {{ group.ageRange }}
              </span>
            </div>

            <!-- Educator row -->
            <div class="flex items-center gap-2 text-sm text-slate-500">
              <UIcon name="i-heroicons-user" class="h-4 w-4 shrink-0 text-slate-400" />
              {{ group.educatorName ?? t('groups.noEducator') }}
            </div>

            <!-- Capacity / fill bar -->
            <div v-if="group.capacity" class="space-y-1.5">
              <div class="flex justify-between text-xs text-slate-500">
                <span>{{ t('groups.childrenCount', { n: group.childrenCount, total: group.capacity }) }}</span>
                <span>{{ fillPercent(group) }}%</span>
              </div>
              <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  :class="['h-full rounded-full transition-all duration-300', fillBarClass(group)]"
                  :style="{ width: `${Math.min(100, fillPercent(group))}%` }"
                />
              </div>
            </div>
            <div v-else class="text-sm text-slate-500">
              <UIcon name="i-heroicons-users" class="mr-1 inline h-4 w-4 text-slate-400" />
              {{ group.childrenCount }} {{ t('nav.children').toLowerCase() }}
            </div>

            <!-- Footer: status + actions -->
            <div class="mt-auto flex items-center justify-between pt-2">
              <UBadge
                :color="group.status === 'active' ? 'success' : 'neutral'"
                variant="soft"
                size="xs"
              >
                {{ t(`groups.status.${group.status}`) }}
              </UBadge>

              <div class="flex items-center gap-2">
                <NuxtLink
                  :to="`/groups/${group.id}`"
                  class="text-sm font-medium text-teal-600 hover:text-teal-700"
                >
                  {{ t('groups.viewDetails') }} →
                </NuxtLink>
                <template v-if="canMutate">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :icon="'i-heroicons-pencil'"
                    @click="openEdit(group)"
                  />
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :icon="group.status === 'active' ? 'i-heroicons-archive-box' : 'i-heroicons-arrow-path'"
                    @click="openArchive(group)"
                  />
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Create modal -->
    <UModal v-model:open="createOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('groups.createTitle') }}</h2>
      </template>
      <template #body>
        <UForm :schema="createGroupSchema" :state="createState" class="space-y-4" @submit="onCreateSubmit">
          <UFormField :label="t('groups.name')" name="name">
            <UInput v-model="createState.name" class="w-full" />
          </UFormField>
          <UFormField :label="t('groups.ageRange')" name="ageRange">
            <UInput v-model="createState.ageRange" :placeholder="t('groups.ageRangePlaceholder')" class="w-full" />
          </UFormField>
          <UFormField :label="t('groups.educator')" name="educatorId">
            <USelect v-model="createState.educatorId" :items="educatorOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('groups.capacity')" name="capacity">
            <UInput v-model="createState.capacity" type="number" min="1" class="w-full" />
          </UFormField>
          <UButton type="submit" color="primary" block loading-auto :loading="loading">
            {{ t('groups.createTitle') }}
          </UButton>
        </UForm>
      </template>
    </UModal>

    <!-- Edit modal -->
    <UModal v-model:open="editOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('groups.editTitle') }}</h2>
      </template>
      <template #body>
        <UForm :schema="updateGroupSchema" :state="editState" class="space-y-4" @submit="onEditSubmit">
          <UFormField :label="t('groups.name')" name="name">
            <UInput v-model="editState.name" class="w-full" />
          </UFormField>
          <UFormField :label="t('groups.ageRange')" name="ageRange">
            <UInput v-model="editState.ageRange" :placeholder="t('groups.ageRangePlaceholder')" class="w-full" />
          </UFormField>
          <UFormField :label="t('groups.educator')" name="educatorId">
            <USelect v-model="editState.educatorId" :items="educatorOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('groups.capacity')" name="capacity">
            <UInput v-model="editState.capacity" type="number" min="1" class="w-full" />
          </UFormField>
          <UButton type="submit" color="primary" loading-auto :loading="loading">{{ t('common.save') }}</UButton>
        </UForm>
      </template>
    </UModal>

    <!-- Archive / restore confirm -->
    <UModal v-model:open="archiveOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">
          {{ archiveTarget?.status === 'active' ? t('groups.confirmArchiveTitle') : t('groups.confirmRestoreTitle') }}
        </h2>
      </template>
      <template #body>
        <p class="text-sm text-slate-500">
          {{ archiveTarget?.status === 'active' ? t('groups.confirmArchiveBody') : t('groups.confirmRestoreBody') }}
        </p>
        <div class="mt-6 flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="archiveOpen = false">{{ t('common.cancel') }}</UButton>
          <UButton color="primary" loading-auto :loading="loading" @click="onArchiveConfirm">
            {{ t('common.confirm') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 6: Add `listChildrenByGroup` to the children service**

At the bottom of `src/modules/children/services/children.service.ts`, add (before the final empty line):

```typescript
export async function listChildrenByGroup(
  client: Client,
  groupId: string,
): Promise<Result<Child[]>> {
  const { data, error } = await client
    .from('children')
    .select('*, groups(name)')
    .eq('group_id', groupId)
    .eq('status', 'enrolled')
    .is('deleted_at', null)
    .order('last_name')
    .order('first_name')

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toChild(r as Record<string, unknown>)) }
}
```

- [ ] **Step 7: Create `src/modules/groups/pages/GroupDetailPage.vue`**

```vue
<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { updateGroupSchema, type UpdateGroupInput } from '~/shared/schemas/groups.schema'
import * as groupsService from '../services/groups.service'
import { listChildrenByGroup } from '~/modules/children/services/children.service'
import type { Group } from '../types/groups.types'
import type { Child } from '~/modules/children/types/children.types'

const props = defineProps<{ id: string }>()

const { t } = useI18n()
const toast = useToast()
const { can } = usePermissions()
const staffStore = useStaffStore()
const authStore = useAuthStore()
const client = useSupabaseClient()

const canMutate = computed(() => can('create', 'groups'))

const group = ref<Group | null>(null)
const children = ref<Child[]>([])

const { pending: groupLoading } = await useLazyAsyncData(
  `group-${props.id}`,
  async () => {
    const [gResult, cResult] = await Promise.all([
      groupsService.getGroup(client, props.id),
      listChildrenByGroup(client, props.id),
    ])
    if (gResult.success) group.value = gResult.data
    if (cResult.success) children.value = cResult.data
  },
)

useLazyAsyncData(
  'group-detail-staff',
  () => group.value ? staffStore.fetchAll(group.value.kindergartenId) : Promise.resolve(),
)

// ── Edit modal ──────────────────────────────────────────────────────────────
const editOpen  = ref(false)
const editState = reactive<Partial<UpdateGroupInput>>({})
const updating  = ref(false)

function openEdit() {
  if (!group.value) return
  editState.name       = group.value.name
  editState.ageRange   = group.value.ageRange
  editState.educatorId = group.value.educatorId
  editState.capacity   = group.value.capacity
  editOpen.value       = true
}

const educatorOptions = computed(() => [
  { label: t('groups.noEducator'), value: null },
  ...staffStore.items
    .filter(s => s.status === 'active' && s.role === 'educator')
    .map(s => ({ label: s.fullName, value: s.id })),
])

async function onEditSubmit(event: FormSubmitEvent<UpdateGroupInput>) {
  if (!group.value) return
  updating.value = true
  const actorId = authStore.user?.id ?? ''
  const result = await groupsService.updateGroup(client, group.value.id, event.data, actorId)
  updating.value = false
  if (!result.success) {
    toast.add({ title: result.error, color: 'error' })
    return
  }
  group.value = { ...result.data, childrenCount: group.value.childrenCount }
  editOpen.value = false
  toast.add({ title: t('groups.updateSuccess'), color: 'success' })
}
</script>

<template>
  <div class="space-y-6">
    <!-- Back -->
    <NuxtLink
      to="/groups"
      class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
    >
      <UIcon name="i-heroicons-arrow-left" class="h-4 w-4" />
      {{ t('common.back') }}
    </NuxtLink>

    <!-- Loading -->
    <div v-if="groupLoading" class="space-y-4">
      <div class="h-36 animate-pulse rounded-2xl bg-white border border-border" />
      <div class="h-64 animate-pulse rounded-2xl bg-white border border-border" />
    </div>

    <template v-else-if="group">
      <!-- Group header card -->
      <div class="rounded-2xl border border-border bg-white p-6">
        <div class="flex items-start justify-between">
          <div class="space-y-2">
            <h1 class="text-xl font-semibold text-slate-800">{{ group.name }}</h1>
            <span
              v-if="group.ageRange"
              class="inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-600"
            >
              {{ group.ageRange }}
            </span>
          </div>
          <UButton v-if="canMutate" color="neutral" variant="soft" size="sm" @click="openEdit">
            <UIcon name="i-heroicons-pencil" class="mr-1 h-4 w-4" />
            {{ t('common.edit') }}
          </UButton>
        </div>

        <div class="mt-6 grid grid-cols-3 gap-6 border-t border-border pt-6">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('groups.educator') }}</p>
            <p class="mt-1 text-sm font-medium text-slate-800">
              {{ group.educatorName ?? t('groups.noEducator') }}
            </p>
          </div>
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('groups.detail.enrolledChildren') }}</p>
            <p class="mt-1 text-sm font-medium text-teal-600">{{ group.childrenCount }}</p>
          </div>
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('groups.capacity') }}</p>
            <p class="mt-1 text-sm font-medium text-slate-800">{{ group.capacity ?? '—' }}</p>
          </div>
        </div>
      </div>

      <!-- Children list -->
      <div class="rounded-2xl border border-border bg-white">
        <div class="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 class="font-semibold text-slate-800">{{ t('groups.detail.enrolledChildren') }}</h2>
          <UBadge color="neutral" variant="soft">{{ children.length }}</UBadge>
        </div>

        <div v-if="children.length === 0" class="py-12 text-center text-sm text-slate-400">
          {{ t('groups.detail.empty') }}
        </div>

        <div v-else class="divide-y divide-border">
          <NuxtLink
            v-for="child in children"
            :key="child.id"
            :to="`/children/${child.id}`"
            class="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-app-bg"
          >
            <BaseAvatar :name="child.fullName" size="sm" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-slate-800">{{ child.fullName }}</p>
              <p class="text-xs text-slate-400">{{ t('children.years', { n: child.age }) }}</p>
            </div>
            <UBadge color="success" variant="soft" size="xs">
              {{ t('children.status.enrolled') }}
            </UBadge>
            <UIcon name="i-heroicons-chevron-right" class="h-4 w-4 text-slate-300" />
          </NuxtLink>
        </div>
      </div>
    </template>

    <!-- Edit modal -->
    <UModal v-model:open="editOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('groups.editTitle') }}</h2>
      </template>
      <template #body>
        <UForm :schema="updateGroupSchema" :state="editState" class="space-y-4" @submit="onEditSubmit">
          <UFormField :label="t('groups.name')" name="name">
            <UInput v-model="editState.name" class="w-full" />
          </UFormField>
          <UFormField :label="t('groups.ageRange')" name="ageRange">
            <UInput v-model="editState.ageRange" :placeholder="t('groups.ageRangePlaceholder')" class="w-full" />
          </UFormField>
          <UFormField :label="t('groups.educator')" name="educatorId">
            <USelect v-model="editState.educatorId" :items="educatorOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('groups.capacity')" name="capacity">
            <UInput v-model="editState.capacity" type="number" min="1" class="w-full" />
          </UFormField>
          <UButton type="submit" color="primary" loading-auto :loading="updating">{{ t('common.save') }}</UButton>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 8: Create `src/pages/groups/[id].vue`**

```vue
<script setup lang="ts">
import GroupDetailPage from '~/modules/groups/pages/GroupDetailPage.vue'
definePageMeta({ layout: 'admin' })
const { id } = useRoute().params as { id: string }
</script>
<template><GroupDetailPage :id="id" /></template>
```

- [ ] **Step 9: Commit**

```bash
git add src/pages/groups/ src/modules/groups/pages/ src/modules/children/services/children.service.ts src/core/i18n/locales/ro.json src/core/i18n/locales/en.json
git rm src/pages/groups.vue
git commit -m "feat(groups): redesign list as card grid, add group detail page"
```

---

### Task 4: Guardians Data Layer

**Files:**
- Create: `src/modules/children/types/guardian.types.ts`
- Create: `src/shared/schemas/guardian.schema.ts`
- Create: `src/modules/children/services/guardians.service.ts`
- Create: `src/modules/children/stores/guardians.store.ts`
- Create: `src/modules/children/composables/useGuardians.ts`
- Modify: `src/core/i18n/locales/ro.json` (add `guardians.*` namespace)
- Modify: `src/core/i18n/locales/en.json`

**Interfaces:**
- Consumes: `Database['public']['Tables']['guardians']` from Task 1 types
- Produces: `Guardian` interface; `useGuardians()` composable returning `{ items, loading, error, fetchForChild, create, update, remove }`

- [ ] **Step 1: Add guardians i18n keys to ro.json**

Add a top-level `"guardians"` namespace to `src/core/i18n/locales/ro.json`:

```json
"guardians": {
  "title": "Contacte tutori",
  "addGuardian": "Adaugă tutore",
  "editGuardian": "Editează tutore",
  "removeGuardian": "Elimină tutore",
  "firstName": "Prenume",
  "lastName": "Nume",
  "email": "Email",
  "phone": "Telefon",
  "relationship": "Relație",
  "isPrimary": "Contact primar",
  "primary": "Primar",
  "notes": "Notițe",
  "relationships": {
    "mother": "Mamă",
    "father": "Tată",
    "guardian": "Tutore",
    "other": "Altul"
  },
  "addSuccess": "Tutore adăugat.",
  "updateSuccess": "Tutore actualizat.",
  "removeSuccess": "Tutore eliminat.",
  "empty": "Niciun tutore adăugat.",
  "confirmRemoveTitle": "Elimină tutorele?",
  "confirmRemoveBody": "Tutorele va fi eliminat din profilul copilului."
}
```

- [ ] **Step 2: Add guardians i18n keys to en.json**

Same structure in `src/core/i18n/locales/en.json`:

```json
"guardians": {
  "title": "Guardian Contacts",
  "addGuardian": "Add Guardian",
  "editGuardian": "Edit Guardian",
  "removeGuardian": "Remove Guardian",
  "firstName": "First name",
  "lastName": "Last name",
  "email": "Email",
  "phone": "Phone",
  "relationship": "Relationship",
  "isPrimary": "Primary contact",
  "primary": "Primary",
  "notes": "Notes",
  "relationships": {
    "mother": "Mother",
    "father": "Father",
    "guardian": "Guardian",
    "other": "Other"
  },
  "addSuccess": "Guardian added.",
  "updateSuccess": "Guardian updated.",
  "removeSuccess": "Guardian removed.",
  "empty": "No guardians added.",
  "confirmRemoveTitle": "Remove guardian?",
  "confirmRemoveBody": "The guardian will be removed from the child's profile."
}
```

- [ ] **Step 3: Create `src/modules/children/types/guardian.types.ts`**

```typescript
export type GuardianRelationship = 'mother' | 'father' | 'guardian' | 'other'

export interface Guardian {
  id: string
  childId: string
  kindergartenId: string
  firstName: string
  lastName: string
  fullName: string
  email: string | null
  phone: string | null
  relationship: GuardianRelationship
  isPrimary: boolean
  notes: string | null
}
```

- [ ] **Step 4: Create `src/shared/schemas/guardian.schema.ts`**

```typescript
import { z } from 'zod'

const RELATIONSHIPS = ['mother', 'father', 'guardian', 'other'] as const

export const createGuardianSchema = z.object({
  childId: z.string().uuid(),
  firstName: z.string().min(1, 'required'),
  lastName: z.string().min(1, 'required'),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  relationship: z.enum(RELATIONSHIPS),
  isPrimary: z.boolean().default(false),
  notes: z.string().nullable().optional(),
})
export type CreateGuardianInput = z.infer<typeof createGuardianSchema>

export const updateGuardianSchema = z.object({
  firstName: z.string().min(1, 'required').optional(),
  lastName: z.string().min(1, 'required').optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  relationship: z.enum(RELATIONSHIPS).optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().nullable().optional(),
})
export type UpdateGuardianInput = z.infer<typeof updateGuardianSchema>
```

- [ ] **Step 5: Create `src/modules/children/services/guardians.service.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { Guardian, GuardianRelationship } from '../types/guardian.types'

type Client = SupabaseClient<Database>

function toGuardian(row: Record<string, unknown>): Guardian {
  const firstName = row.first_name as string
  const lastName  = row.last_name as string
  return {
    id:             row.id as string,
    childId:        row.child_id as string,
    kindergartenId: row.kindergarten_id as string,
    firstName,
    lastName,
    fullName:       `${firstName} ${lastName}`,
    email:          (row.email as string | null) ?? null,
    phone:          (row.phone as string | null) ?? null,
    relationship:   row.relationship as GuardianRelationship,
    isPrimary:      row.is_primary as boolean,
    notes:          (row.notes as string | null) ?? null,
  }
}

export async function listGuardians(
  client: Client,
  childId: string,
): Promise<Result<Guardian[]>> {
  const { data, error } = await client
    .from('guardians')
    .select('*')
    .eq('child_id', childId)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .order('last_name')

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: (data ?? []).map(r => toGuardian(r as Record<string, unknown>)),
  }
}

export async function createGuardian(
  client: Client,
  input: {
    childId: string
    kindergartenId: string
    firstName: string
    lastName: string
    email?: string | null
    phone?: string | null
    relationship: GuardianRelationship
    isPrimary?: boolean
    notes?: string | null
  },
  actorId: string,
): Promise<Result<Guardian>> {
  const { data, error } = await client
    .from('guardians')
    .insert({
      child_id:        input.childId,
      kindergarten_id: input.kindergartenId,
      first_name:      input.firstName,
      last_name:       input.lastName,
      email:           input.email ?? null,
      phone:           input.phone ?? null,
      relationship:    input.relationship,
      is_primary:      input.isPrimary ?? false,
      notes:           input.notes ?? null,
      created_by:      actorId,
      updated_by:      actorId,
    })
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data: toGuardian(data as Record<string, unknown>) }
}

export async function updateGuardian(
  client: Client,
  id: string,
  input: {
    firstName?: string
    lastName?: string
    email?: string | null
    phone?: string | null
    relationship?: GuardianRelationship
    isPrimary?: boolean
    notes?: string | null
  },
  actorId: string,
): Promise<Result<Guardian>> {
  const payload: Database['public']['Tables']['guardians']['Update'] = { updated_by: actorId }
  if (input.firstName    !== undefined) payload.first_name   = input.firstName
  if (input.lastName     !== undefined) payload.last_name    = input.lastName
  if (input.email        !== undefined) payload.email        = input.email
  if (input.phone        !== undefined) payload.phone        = input.phone
  if (input.relationship !== undefined) payload.relationship = input.relationship
  if (input.isPrimary    !== undefined) payload.is_primary   = input.isPrimary
  if (input.notes        !== undefined) payload.notes        = input.notes

  const { data, error } = await client
    .from('guardians')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data: toGuardian(data as Record<string, unknown>) }
}

export async function removeGuardian(
  client: Client,
  id: string,
  actorId: string,
): Promise<Result<void>> {
  const { error } = await client
    .from('guardians')
    .update({ deleted_at: new Date().toISOString(), updated_by: actorId })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}
```

- [ ] **Step 6: Create `src/modules/children/stores/guardians.store.ts`**

```typescript
import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as guardiansSvc from '../services/guardians.service'
import type { Guardian, GuardianRelationship } from '../types/guardian.types'

export const useGuardiansStore = defineStore('guardians', {
  state: () => ({
    items:   [] as Guardian[],
    loading: false,
    error:   null as string | null,
  }),
  actions: {
    async fetchForChild(childId: string) {
      this.loading = true
      this.error   = null
      const result = await guardiansSvc.listGuardians(useSupabaseClient(), childId)
      this.loading = false
      if (!result.success) { this.error = result.error; return }
      this.items = result.data
    },
    async create(input: Parameters<typeof guardiansSvc.createGuardian>[1]) {
      const actorId = useAuthStore().user?.id ?? ''
      const result  = await guardiansSvc.createGuardian(useSupabaseClient(), input, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.items.push(result.data)
      this.items.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
      return true
    },
    async update(
      id: string,
      input: {
        firstName?: string; lastName?: string
        email?: string | null; phone?: string | null
        relationship?: GuardianRelationship; isPrimary?: boolean; notes?: string | null
      },
    ) {
      const actorId = useAuthStore().user?.id ?? ''
      const result  = await guardiansSvc.updateGuardian(useSupabaseClient(), id, input, actorId)
      if (!result.success) { this.error = result.error; return false }
      const idx = this.items.findIndex(g => g.id === id)
      if (idx !== -1) this.items[idx] = result.data
      return true
    },
    async remove(id: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result  = await guardiansSvc.removeGuardian(useSupabaseClient(), id, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.items = this.items.filter(g => g.id !== id)
      return true
    },
  },
})
```

- [ ] **Step 7: Create `src/modules/children/composables/useGuardians.ts`**

```typescript
import { computed } from 'vue'
import { useGuardiansStore } from '../stores/guardians.store'

export function useGuardians() {
  const store = useGuardiansStore()
  return {
    items:        computed(() => store.items),
    loading:      computed(() => store.loading),
    error:        computed(() => store.error),
    fetchForChild: (childId: string) => store.fetchForChild(childId),
    create:        (input: Parameters<typeof store.create>[0]) => store.create(input),
    update:        (id: string, input: Parameters<typeof store.update>[1]) => store.update(id, input),
    remove:        (id: string) => store.remove(id),
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add src/modules/children/types/guardian.types.ts src/shared/schemas/guardian.schema.ts src/modules/children/services/guardians.service.ts src/modules/children/stores/guardians.store.ts src/modules/children/composables/useGuardians.ts src/core/i18n/locales/ro.json src/core/i18n/locales/en.json
git commit -m "feat(guardians): add guardian data layer (type, schema, service, store, composable)"
```

---

### Task 5: Child Profile Page

**Files:**
- Modify: `src/modules/children/services/children.service.ts` (add `getChild`)
- Create: `src/pages/children/index.vue`
- Delete: `src/pages/children.vue`
- Create: `src/modules/children/pages/ChildProfilePage.vue`
- Create: `src/pages/children/[id].vue`
- Modify: `src/modules/children/pages/ChildrenListPage.vue` (make child name a link)
- Modify: `src/core/i18n/locales/ro.json` (add `children.profile.*`)
- Modify: `src/core/i18n/locales/en.json`

**Interfaces:**
- Consumes: `Guardian`, `useGuardians()` from Task 4; `getChild()` added in this task
- Produces: `/children/:id` route; `ChildProfilePage` component

- [ ] **Step 1: Add child profile i18n keys to ro.json**

Inside the `"children"` object, add:

```json
"profile": {
  "title": "Profilul copilului",
  "medicalAlerts": "Alerte medicale și alergii",
  "noMedicalAlerts": "Nicio alertă medicală înregistrată.",
  "enrollmentStats": "Statistici înrolare",
  "attendance": "Prezență",
  "activityScore": "Scor activitate",
  "recentActivity": "Activitate recentă",
  "noActivity": "Nicio activitate recentă.",
  "studentId": "ID Student",
  "exportForm": "Exportă formular înscriere",
  "editProfile": "Editează profilul"
}
```

- [ ] **Step 2: Add child profile i18n keys to en.json**

Inside the `"children"` object:

```json
"profile": {
  "title": "Child Profile",
  "medicalAlerts": "Medical Alerts & Allergies",
  "noMedicalAlerts": "No medical alerts on record.",
  "enrollmentStats": "Enrollment Stats",
  "attendance": "Attendance",
  "activityScore": "Activity Score",
  "recentActivity": "Recent Activity",
  "noActivity": "No recent activity.",
  "studentId": "Student ID",
  "exportForm": "Export Enrollment Form",
  "editProfile": "Edit Profile"
}
```

- [ ] **Step 3: Add `getChild` to the children service**

At the bottom of `src/modules/children/services/children.service.ts` (after `setChildStatus`):

```typescript
export async function getChild(
  client: Client,
  id: string,
): Promise<Result<Child>> {
  const { data, error } = await client
    .from('children')
    .select('*, groups(name)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'not_found' }
  return { success: true, data: toChild(data as Record<string, unknown>) }
}
```

- [ ] **Step 4: Create `src/pages/children/index.vue`**

```vue
<script setup lang="ts">
import ChildrenListPage from '~/modules/children/pages/ChildrenListPage.vue'
definePageMeta({ layout: 'admin' })
</script>
<template><ChildrenListPage /></template>
```

- [ ] **Step 5: Delete `src/pages/children.vue`**

```bash
rm src/pages/children.vue
```

- [ ] **Step 6: Create `src/modules/children/pages/ChildProfilePage.vue`**

```vue
<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { updateChildSchema, type UpdateChildInput } from '~/shared/schemas/children.schema'
import { createGuardianSchema, updateGuardianSchema, type CreateGuardianInput, type UpdateGuardianInput } from '~/shared/schemas/guardian.schema'
import * as childrenSvc from '../services/children.service'
import type { Child } from '../types/children.types'
import type { Guardian } from '../types/guardian.types'

const props = defineProps<{ id: string }>()

const { t } = useI18n()
const toast = useToast()
const { can } = usePermissions()
const authStore = useAuthStore()
const client = useSupabaseClient()
const groupsStore = useGroupsStore()
const { items: guardians, loading: guardiansLoading, fetchForChild, create: createGuardian, update: updateGuardian, remove: removeGuardian } = useGuardians()

const canMutate = computed(() => can('update', 'children'))

const child = ref<Child | null>(null)

const { pending: childLoading } = await useLazyAsyncData(
  `child-${props.id}`,
  async () => {
    const result = await childrenSvc.getChild(client, props.id)
    if (result.success) child.value = result.data
  },
)

useLazyAsyncData(
  `child-guardians-${props.id}`,
  () => fetchForChild(props.id),
)

useLazyAsyncData(
  'child-profile-groups',
  () => child.value ? groupsStore.fetchAll(child.value.kindergartenId) : Promise.resolve(),
)

// ── Computed ─────────────────────────────────────────────────────────────────
const primaryGuardian   = computed(() => guardians.value.find(g => g.isPrimary) ?? null)
const secondaryGuardians = computed(() => guardians.value.filter(g => !g.isPrimary))
const hasMedical        = computed(() => !!child.value?.allergies || !!child.value?.medicalNotes)

// ── Edit child modal ──────────────────────────────────────────────────────────
const editOpen   = ref(false)
const editState  = reactive<Partial<UpdateChildInput>>({})
const editLoading = ref(false)

const groupOptions = computed(() => [
  { label: t('children.noGroup'), value: null },
  ...groupsStore.items.filter(g => g.status === 'active').map(g => ({ label: g.name, value: g.id })),
])

function openEdit() {
  if (!child.value) return
  editState.firstName   = child.value.firstName
  editState.lastName    = child.value.lastName
  editState.birthDate   = child.value.birthDate
  editState.bloodGroup  = child.value.bloodGroup
  editState.allergies   = child.value.allergies
  editState.medicalNotes = child.value.medicalNotes
  editState.nationalId  = child.value.nationalId
  editState.idType      = child.value.idType
  editState.groupId     = child.value.groupId
  editOpen.value        = true
}

async function onEditSubmit(event: FormSubmitEvent<UpdateChildInput>) {
  if (!child.value) return
  editLoading.value = true
  const actorId = authStore.user?.id ?? ''
  const result = await childrenSvc.updateChild(client, child.value.id, event.data, actorId)
  editLoading.value = false
  if (!result.success) { toast.add({ title: result.error, color: 'error' }); return }
  child.value = result.data
  editOpen.value = false
  toast.add({ title: t('children.updateSuccess'), color: 'success' })
}

// ── Add guardian modal ────────────────────────────────────────────────────────
const addGuardianOpen  = ref(false)
const addGuardianState = reactive<Partial<CreateGuardianInput>>({
  childId: props.id, firstName: undefined, lastName: undefined,
  email: null, phone: null, relationship: 'guardian', isPrimary: false, notes: null,
})

function openAddGuardian() {
  addGuardianState.firstName   = undefined
  addGuardianState.lastName    = undefined
  addGuardianState.email       = null
  addGuardianState.phone       = null
  addGuardianState.relationship = 'guardian'
  addGuardianState.isPrimary   = false
  addGuardianState.notes       = null
  addGuardianState.childId     = props.id
  addGuardianOpen.value        = true
}

async function onAddGuardianSubmit(event: FormSubmitEvent<CreateGuardianInput>) {
  if (!child.value) return
  const ok = await createGuardian({
    ...event.data,
    childId: props.id,
    kindergartenId: child.value.kindergartenId,
  })
  if (ok) {
    addGuardianOpen.value = false
    toast.add({ title: t('guardians.addSuccess'), color: 'success' })
  }
}

// ── Edit guardian modal ───────────────────────────────────────────────────────
const editGuardianOpen   = ref(false)
const editGuardianTarget = ref<Guardian | null>(null)
const editGuardianState  = reactive<Partial<UpdateGuardianInput>>({})

function openEditGuardian(g: Guardian) {
  editGuardianTarget.value   = g
  editGuardianState.firstName   = g.firstName
  editGuardianState.lastName    = g.lastName
  editGuardianState.email       = g.email
  editGuardianState.phone       = g.phone
  editGuardianState.relationship = g.relationship
  editGuardianState.isPrimary   = g.isPrimary
  editGuardianState.notes       = g.notes
  editGuardianOpen.value        = true
}

async function onEditGuardianSubmit(event: FormSubmitEvent<UpdateGuardianInput>) {
  if (!editGuardianTarget.value) return
  const ok = await updateGuardian(editGuardianTarget.value.id, event.data)
  if (ok) {
    editGuardianOpen.value = false
    toast.add({ title: t('guardians.updateSuccess'), color: 'success' })
  }
}

// ── Remove guardian ───────────────────────────────────────────────────────────
const removeGuardianOpen   = ref(false)
const removeGuardianTarget = ref<Guardian | null>(null)

function openRemoveGuardian(g: Guardian) {
  removeGuardianTarget.value = g
  removeGuardianOpen.value   = true
}

async function onRemoveGuardianConfirm() {
  if (!removeGuardianTarget.value) return
  const ok = await removeGuardian(removeGuardianTarget.value.id)
  if (ok) {
    removeGuardianOpen.value = false
    toast.add({ title: t('guardians.removeSuccess'), color: 'success' })
  }
}

const relationshipOptions = computed(() =>
  (['mother', 'father', 'guardian', 'other'] as const).map(r => ({
    label: t(`guardians.relationships.${r}`),
    value: r,
  })),
)

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase()
}
</script>

<template>
  <div class="space-y-6">
    <!-- Back -->
    <NuxtLink
      to="/children"
      class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
    >
      <UIcon name="i-heroicons-arrow-left" class="h-4 w-4" />
      {{ t('common.back') }}
    </NuxtLink>

    <!-- Loading -->
    <div v-if="childLoading" class="flex gap-6">
      <div class="h-96 w-1/3 animate-pulse rounded-2xl bg-white border border-border" />
      <div class="h-96 flex-1 animate-pulse rounded-2xl bg-white border border-border" />
    </div>

    <template v-else-if="child">
      <div class="flex gap-6 items-start">
        <!-- ── Left panel (1/3) ───────────────────────────────────────────── -->
        <div class="w-1/3 space-y-4">
          <!-- Photo + name card -->
          <div class="rounded-2xl border border-border bg-white p-6 text-center">
            <BaseAvatar :name="child.fullName" size="xl" class="mx-auto" />
            <h2 class="mt-4 text-lg font-semibold text-slate-800">{{ child.fullName }}</h2>
            <span
              v-if="child.groupName"
              class="mt-1.5 inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-600"
            >
              {{ child.groupName }}
            </span>
            <UButton
              v-if="canMutate"
              color="neutral"
              variant="soft"
              size="sm"
              class="mt-4 w-full"
              @click="openEdit"
            >
              <UIcon name="i-heroicons-pencil" class="mr-1.5 h-4 w-4" />
              {{ t('children.profile.editProfile') }}
            </UButton>
          </div>

          <!-- Details card -->
          <div class="rounded-2xl border border-border bg-white p-6 space-y-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('children.profile.studentId') }}</p>
              <p class="mt-1 font-mono text-sm text-slate-600">{{ shortId(child.id) }}</p>
            </div>
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('children.birthDate') }}</p>
              <p class="mt-1 text-sm text-slate-800">{{ child.birthDate }}</p>
            </div>
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('children.age') }}</p>
              <p class="mt-1 text-sm text-slate-800">{{ t('children.years', { n: child.age }) }}</p>
            </div>
            <div v-if="child.bloodGroup">
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('children.bloodGroup') }}</p>
              <p class="mt-1 text-sm font-medium text-slate-800">{{ child.bloodGroup }}</p>
            </div>
            <div v-if="child.nationalId">
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ child.idType ?? t('children.nationalId') }}</p>
              <p class="mt-1 font-mono text-sm text-slate-600">{{ child.nationalId }}</p>
            </div>
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('children.table.status') }}</p>
              <UBadge
                :color="child.status === 'enrolled' ? 'success' : child.status === 'withdrawn' ? 'warning' : 'neutral'"
                variant="soft"
                size="sm"
                class="mt-1"
              >
                {{ t(`children.status.${child.status}`) }}
              </UBadge>
            </div>
          </div>

          <!-- Enrollment stats card (placeholder — no live data yet) -->
          <div class="rounded-2xl border border-border bg-white p-6 space-y-4">
            <h3 class="text-sm font-semibold text-slate-700">{{ t('children.profile.enrollmentStats') }}</h3>
            <div class="flex justify-between">
              <div class="text-center">
                <p class="text-2xl font-semibold tabular-nums text-teal-600">—</p>
                <p class="mt-0.5 text-xs text-slate-400">{{ t('children.profile.attendance') }}</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-semibold tabular-nums text-teal-600">—</p>
                <p class="mt-0.5 text-xs text-slate-400">{{ t('children.profile.activityScore') }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Right panel (flex-1) ──────────────────────────────────────── -->
        <div class="flex-1 space-y-4">
          <!-- Medical alerts -->
          <div
            :class="[
              'rounded-2xl border p-6',
              hasMedical
                ? 'border-brand-gold/30 bg-brand-yellow/10'
                : 'border-border bg-white',
            ]"
          >
            <div class="flex items-center gap-2">
              <UIcon
                :name="hasMedical ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-check-circle'"
                :class="['h-5 w-5', hasMedical ? 'text-brand-gold' : 'text-slate-400']"
              />
              <h3 class="font-semibold text-slate-800">{{ t('children.profile.medicalAlerts') }}</h3>
            </div>

            <div v-if="hasMedical" class="mt-4 space-y-3">
              <div v-if="child.allergies">
                <p class="text-xs font-medium uppercase tracking-wide text-slate-500">{{ t('children.allergies') }}</p>
                <p class="mt-1 text-sm text-slate-700">{{ child.allergies }}</p>
              </div>
              <div v-if="child.medicalNotes">
                <p class="text-xs font-medium uppercase tracking-wide text-slate-500">{{ t('children.medicalNotes') }}</p>
                <p class="mt-1 text-sm text-slate-700">{{ child.medicalNotes }}</p>
              </div>
            </div>
            <p v-else class="mt-3 text-sm text-slate-400">{{ t('children.profile.noMedicalAlerts') }}</p>
          </div>

          <!-- Guardian contacts -->
          <div class="rounded-2xl border border-border bg-white p-6">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-slate-800">{{ t('guardians.title') }}</h3>
              <UButton
                v-if="canMutate"
                color="primary"
                variant="soft"
                size="sm"
                @click="openAddGuardian"
              >
                <UIcon name="i-heroicons-plus" class="mr-1 h-4 w-4" />
                {{ t('guardians.addGuardian') }}
              </UButton>
            </div>

            <div v-if="guardiansLoading" class="mt-4 space-y-3">
              <div class="h-24 animate-pulse rounded-xl bg-slate-50" />
              <div class="h-24 animate-pulse rounded-xl bg-slate-50" />
            </div>

            <p v-else-if="guardians.length === 0" class="mt-4 text-sm text-slate-400">
              {{ t('guardians.empty') }}
            </p>

            <div v-else class="mt-4 grid grid-cols-2 gap-4">
              <!-- Primary guardian -->
              <div
                v-if="primaryGuardian"
                class="rounded-xl border-2 border-teal-600 bg-white p-4"
              >
                <div class="flex items-start justify-between">
                  <span class="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-600">
                    {{ t('guardians.primary') }}
                  </span>
                  <div v-if="canMutate" class="flex gap-1">
                    <UButton size="xs" color="neutral" variant="ghost" icon="i-heroicons-pencil" @click="openEditGuardian(primaryGuardian)" />
                    <UButton size="xs" color="error" variant="ghost" icon="i-heroicons-trash" @click="openRemoveGuardian(primaryGuardian)" />
                  </div>
                </div>
                <div class="mt-3">
                  <BaseAvatar :name="primaryGuardian.fullName" size="sm" />
                  <p class="mt-2 font-medium text-slate-800">{{ primaryGuardian.fullName }}</p>
                  <p class="text-xs text-slate-500">{{ t(`guardians.relationships.${primaryGuardian.relationship}`) }}</p>
                  <div class="mt-3 space-y-1">
                    <a v-if="primaryGuardian.phone" :href="`tel:${primaryGuardian.phone}`" class="flex items-center gap-1.5 text-sm text-slate-600 hover:text-teal-600">
                      <UIcon name="i-heroicons-phone" class="h-3.5 w-3.5" />
                      {{ primaryGuardian.phone }}
                    </a>
                    <a v-if="primaryGuardian.email" :href="`mailto:${primaryGuardian.email}`" class="flex items-center gap-1.5 text-sm text-slate-600 hover:text-teal-600">
                      <UIcon name="i-heroicons-envelope" class="h-3.5 w-3.5" />
                      {{ primaryGuardian.email }}
                    </a>
                  </div>
                </div>
              </div>

              <!-- Secondary guardians -->
              <div
                v-for="g in secondaryGuardians"
                :key="g.id"
                class="rounded-xl border border-border bg-white p-4"
              >
                <div class="flex items-start justify-end">
                  <div v-if="canMutate" class="flex gap-1">
                    <UButton size="xs" color="neutral" variant="ghost" icon="i-heroicons-pencil" @click="openEditGuardian(g)" />
                    <UButton size="xs" color="error" variant="ghost" icon="i-heroicons-trash" @click="openRemoveGuardian(g)" />
                  </div>
                </div>
                <div>
                  <BaseAvatar :name="g.fullName" size="sm" />
                  <p class="mt-2 font-medium text-slate-800">{{ g.fullName }}</p>
                  <p class="text-xs text-slate-500">{{ t(`guardians.relationships.${g.relationship}`) }}</p>
                  <div class="mt-3 space-y-1">
                    <a v-if="g.phone" :href="`tel:${g.phone}`" class="flex items-center gap-1.5 text-sm text-slate-600 hover:text-teal-600">
                      <UIcon name="i-heroicons-phone" class="h-3.5 w-3.5" />
                      {{ g.phone }}
                    </a>
                    <a v-if="g.email" :href="`mailto:${g.email}`" class="flex items-center gap-1.5 text-sm text-slate-600 hover:text-teal-600">
                      <UIcon name="i-heroicons-envelope" class="h-3.5 w-3.5" />
                      {{ g.email }}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Recent activity (placeholder) -->
          <div class="rounded-2xl border border-border bg-white p-6">
            <h3 class="font-semibold text-slate-800">{{ t('children.profile.recentActivity') }}</h3>
            <p class="mt-4 text-sm text-slate-400">{{ t('children.profile.noActivity') }}</p>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Modals ──────────────────────────────────────────────────────────── -->

    <!-- Edit child -->
    <UModal v-model:open="editOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('children.editTitle') }}</h2>
      </template>
      <template #body>
        <UForm :schema="updateChildSchema" :state="editState" class="space-y-4" @submit="onEditSubmit">
          <div class="grid grid-cols-2 gap-4">
            <UFormField :label="t('children.firstName')" name="firstName">
              <UInput v-model="editState.firstName" class="w-full" />
            </UFormField>
            <UFormField :label="t('children.lastName')" name="lastName">
              <UInput v-model="editState.lastName" class="w-full" />
            </UFormField>
          </div>
          <UFormField :label="t('children.birthDate')" name="birthDate">
            <UInput v-model="editState.birthDate" type="date" class="w-full" />
          </UFormField>
          <UFormField :label="t('children.group')" name="groupId">
            <USelect v-model="editState.groupId" :items="groupOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('children.bloodGroup')" name="bloodGroup">
            <USelect
              v-model="editState.bloodGroup"
              :items="[{ label: '—', value: null }, ...['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg => ({ label: bg, value: bg }))]"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('children.allergies')" name="allergies">
            <UTextarea v-model="editState.allergies" :rows="2" class="w-full" />
          </UFormField>
          <UFormField :label="t('children.medicalNotes')" name="medicalNotes">
            <UTextarea v-model="editState.medicalNotes" :rows="2" class="w-full" />
          </UFormField>
          <UButton type="submit" color="primary" loading-auto :loading="editLoading">{{ t('common.save') }}</UButton>
        </UForm>
      </template>
    </UModal>

    <!-- Add guardian -->
    <UModal v-model:open="addGuardianOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('guardians.addGuardian') }}</h2>
      </template>
      <template #body>
        <UForm :schema="createGuardianSchema" :state="addGuardianState" class="space-y-4" @submit="onAddGuardianSubmit">
          <div class="grid grid-cols-2 gap-4">
            <UFormField :label="t('guardians.firstName')" name="firstName">
              <UInput v-model="addGuardianState.firstName" class="w-full" />
            </UFormField>
            <UFormField :label="t('guardians.lastName')" name="lastName">
              <UInput v-model="addGuardianState.lastName" class="w-full" />
            </UFormField>
          </div>
          <UFormField :label="t('guardians.relationship')" name="relationship">
            <USelect v-model="addGuardianState.relationship" :items="relationshipOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('guardians.phone')" name="phone">
            <UInput v-model="addGuardianState.phone" class="w-full" />
          </UFormField>
          <UFormField :label="t('guardians.email')" name="email">
            <UInput v-model="addGuardianState.email" type="email" class="w-full" />
          </UFormField>
          <UFormField :label="t('guardians.notes')" name="notes">
            <UTextarea v-model="addGuardianState.notes" :rows="2" class="w-full" />
          </UFormField>
          <UFormField name="isPrimary">
            <UCheckbox v-model="addGuardianState.isPrimary" :label="t('guardians.isPrimary')" />
          </UFormField>
          <UButton type="submit" color="primary" block loading-auto>{{ t('guardians.addGuardian') }}</UButton>
        </UForm>
      </template>
    </UModal>

    <!-- Edit guardian -->
    <UModal v-model:open="editGuardianOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('guardians.editGuardian') }}</h2>
      </template>
      <template #body>
        <UForm :schema="updateGuardianSchema" :state="editGuardianState" class="space-y-4" @submit="onEditGuardianSubmit">
          <div class="grid grid-cols-2 gap-4">
            <UFormField :label="t('guardians.firstName')" name="firstName">
              <UInput v-model="editGuardianState.firstName" class="w-full" />
            </UFormField>
            <UFormField :label="t('guardians.lastName')" name="lastName">
              <UInput v-model="editGuardianState.lastName" class="w-full" />
            </UFormField>
          </div>
          <UFormField :label="t('guardians.relationship')" name="relationship">
            <USelect v-model="editGuardianState.relationship" :items="relationshipOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('guardians.phone')" name="phone">
            <UInput v-model="editGuardianState.phone" class="w-full" />
          </UFormField>
          <UFormField :label="t('guardians.email')" name="email">
            <UInput v-model="editGuardianState.email" type="email" class="w-full" />
          </UFormField>
          <UFormField :label="t('guardians.notes')" name="notes">
            <UTextarea v-model="editGuardianState.notes" :rows="2" class="w-full" />
          </UFormField>
          <UFormField name="isPrimary">
            <UCheckbox v-model="editGuardianState.isPrimary" :label="t('guardians.isPrimary')" />
          </UFormField>
          <UButton type="submit" color="primary" loading-auto>{{ t('common.save') }}</UButton>
        </UForm>
      </template>
    </UModal>

    <!-- Remove guardian confirm -->
    <UModal v-model:open="removeGuardianOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('guardians.confirmRemoveTitle') }}</h2>
      </template>
      <template #body>
        <p class="text-sm text-slate-500">{{ t('guardians.confirmRemoveBody') }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="removeGuardianOpen = false">{{ t('common.cancel') }}</UButton>
          <UButton color="error" loading-auto @click="onRemoveGuardianConfirm">{{ t('guardians.removeGuardian') }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 7: Create `src/pages/children/[id].vue`**

```vue
<script setup lang="ts">
import ChildProfilePage from '~/modules/children/pages/ChildProfilePage.vue'
definePageMeta({ layout: 'admin' })
const { id } = useRoute().params as { id: string }
</script>
<template><ChildProfilePage :id="id" /></template>
```

- [ ] **Step 8: Make child name clickable in `ChildrenListPage.vue`**

In `src/modules/children/pages/ChildrenListPage.vue`, find the `child` column cell (around line 150–160):

```typescript
// OLD
cell: ({ row }) =>
  h('div', { class: 'flex items-center gap-3' }, [
    h(BaseAvatar, { name: row.original.fullName, size: 'sm' }),
    h('div', {}, [
      h('p', { class: 'text-sm font-medium text-slate-800' }, row.original.fullName),
      h('p', { class: 'text-xs text-slate-400' }, row.original.birthDate),
    ]),
  ]),
```

Replace with (uses NuxtLink resolved as a component):

```typescript
// NEW — wrap name in a link to child profile
cell: ({ row }) => {
  const NuxtLink = resolveComponent('NuxtLink')
  return h('div', { class: 'flex items-center gap-3' }, [
    h(BaseAvatar, { name: row.original.fullName, size: 'sm' }),
    h('div', {}, [
      h(NuxtLink,
        { to: `/children/${row.original.id}`, class: 'text-sm font-medium text-slate-800 hover:text-teal-600' },
        () => row.original.fullName,
      ),
      h('p', { class: 'text-xs text-slate-400' }, row.original.birthDate),
    ]),
  ])
},
```

Also update the `group` column cell to show a colored badge instead of plain text. Find the `groupName` accessor cell:

```typescript
// OLD
cell: ({ row }) => h('span', { class: 'text-sm text-slate-500' }, row.original.groupName ?? '—'),
```

Replace with:

```typescript
// NEW — teal pill badge when group is assigned
cell: ({ row }) =>
  row.original.groupName
    ? h('span', { class: 'inline-block rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-600' }, row.original.groupName)
    : h('span', { class: 'text-sm text-slate-400' }, '—'),
```

- [ ] **Step 9: Commit**

```bash
git add src/modules/children/services/children.service.ts src/pages/children/ src/modules/children/pages/ChildProfilePage.vue src/modules/children/pages/ChildrenListPage.vue src/core/i18n/locales/ro.json src/core/i18n/locales/en.json
git rm src/pages/children.vue
git commit -m "feat(children): add child profile page with guardian contacts and medical alerts"
```

---

### Task 6: Children Directory Enhancement

**Files:**
- Modify: `src/modules/children/types/children.types.ts` (add `primaryGuardian` field)
- Modify: `src/modules/children/services/children.service.ts` (join guardians in `listChildren`)
- Modify: `src/modules/children/pages/ChildrenListPage.vue` (add guardian column, better stat cards)

**Interfaces:**
- Consumes: `Guardian` type from Task 4; updated `listChildren` from this task
- Produces: `Child.primaryGuardian` field; guardian column in children table

**Note:** The guardian column is read-only on the list — full management is on the child profile page.

- [ ] **Step 1: Add `primaryGuardian` to the Child type**

Replace the entire contents of `src/modules/children/types/children.types.ts`:

```typescript
export interface ChildGuardianSummary {
  fullName: string
  phone: string | null
  email: string | null
  relationship: string
}

export interface Child {
  id: string
  firstName: string
  lastName: string
  fullName: string
  birthDate: string
  age: number
  bloodGroup: string | null
  allergies: string | null
  medicalNotes: string | null
  nationalId: string | null
  idType: 'CNP' | 'IDNP' | null
  status: 'enrolled' | 'withdrawn' | 'graduated'
  groupId: string | null
  groupName: string | null
  kindergartenId: string
  primaryGuardian: ChildGuardianSummary | null
}
```

- [ ] **Step 2: Update `listChildren` to join primary guardian**

In `src/modules/children/services/children.service.ts`, replace `listChildren` and `toChild`:

```typescript
// Replace the existing toChild function
function toChild(row: Record<string, unknown>): Child {
  const firstName = row.first_name as string
  const lastName  = row.last_name as string
  const birthDate = row.birth_date as string

  // Primary guardian comes from the joined guardians array (may be null if no guardians)
  type RawGuardian = {
    first_name: string; last_name: string
    phone: string | null; email: string | null
    relationship: string; is_primary: boolean; deleted_at: string | null
  }
  const rawGuardians = (row.guardians as RawGuardian[] | null) ?? []
  const primary = rawGuardians.find(g => g.is_primary && !g.deleted_at) ?? null

  return {
    id:           row.id as string,
    firstName,
    lastName,
    fullName:     `${firstName} ${lastName}`,
    birthDate,
    age:          computeAge(birthDate),
    bloodGroup:   (row.blood_group as string | null) ?? null,
    allergies:    (row.allergies as string | null) ?? null,
    medicalNotes: (row.medical_notes as string | null) ?? null,
    nationalId:   (row.national_id as string | null) ?? null,
    idType:       (row.id_type as NationalIdType | null) ?? null,
    status:       row.status as ChildStatus,
    groupId:      (row.group_id as string | null) ?? null,
    groupName:    ((row.groups as { name: string } | null)?.name) ?? null,
    kindergartenId: row.kindergarten_id as string,
    primaryGuardian: primary
      ? {
          fullName:     `${primary.first_name} ${primary.last_name}`,
          phone:        primary.phone,
          email:        primary.email,
          relationship: primary.relationship,
        }
      : null,
  }
}

// Replace listChildren
export async function listChildren(
  client: Client,
  kindergartenId: string,
): Promise<Result<Child[]>> {
  let q = client
    .from('children')
    .select('*, groups(name), guardians(first_name, last_name, phone, email, relationship, is_primary, deleted_at)')
    .is('deleted_at', null)
    .order('last_name')
    .order('first_name')

  if (kindergartenId !== 'ALL') q = q.eq('kindergarten_id', kindergartenId)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toChild(r as Record<string, unknown>)) }
}
```

The `createChild`, `updateChild`, `setChildStatus`, `getChild`, and `listChildrenByGroup` functions do not return guardians — their `toChild` call will see `row.guardians` as `undefined`, which the null-coalescing handles correctly (returns `null` for `primaryGuardian`). No changes needed to those functions.

- [ ] **Step 3: Add guardian column to ChildrenListPage.vue**

In `src/modules/children/pages/ChildrenListPage.vue`, in the `columns` computed array, add a new column after `groupName`:

```typescript
// Add this after the groupName column and before the status column
{
  id: 'guardian',
  header: t('guardians.title'),
  cell: ({ row }) => {
    const g = row.original.primaryGuardian
    if (!g) return h('span', { class: 'text-sm text-slate-400' }, '—')
    return h('div', {}, [
      h('p', { class: 'text-sm text-slate-800' }, g.fullName),
      h('p', { class: 'text-xs text-slate-400' }, g.phone ?? g.email ?? ''),
    ])
  },
},
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/children/types/children.types.ts src/modules/children/services/children.service.ts src/modules/children/pages/ChildrenListPage.vue
git commit -m "feat(children): add primary guardian column and join to children list"
```

---

## Self-Review

**Spec coverage:**
- [x] Groups card grid matching design mockup — Task 3
- [x] Groups stats bar — Task 3
- [x] Groups capacity column + fill bar — Tasks 2 + 3
- [x] Group detail page `/groups/:id` with children list — Task 3
- [x] `guardians` DB table with RLS + soft delete — Task 1
- [x] Guardians data layer (type, schema, service, store, composable) — Task 4
- [x] Child profile page `/children/:id` with two-column layout — Task 5
- [x] Medical alerts section on child profile — Task 5
- [x] Guardian contacts on child profile (add, edit, remove) — Task 5
- [x] Children directory: guardian column — Task 6
- [x] Children directory: colored group badge — Task 3/5 (added in list column)
- [x] Children directory: clickable name → child profile — Task 5
- [x] i18n for all new strings (RO + EN) — Tasks 3, 4, 5
- [x] `pages/groups.vue` → `pages/groups/index.vue` to enable `/groups/[id]` — Task 3
- [x] `pages/children.vue` → `pages/children/index.vue` to enable `/children/[id]` — Task 5
- [x] Soft delete on guardians — Task 4 service uses `deleted_at`
- [x] No hard-coded strings — all via `t()`
- [x] Permissions via `can()` — gating create/edit/remove throughout
- [x] Service-only DB access — all Supabase calls in service files

**Placeholder scan:** No TBD, no TODO, no "similar to task N". All code blocks are complete.

**Type consistency:**
- `Group.childrenCount` added in Task 2 types, used in Task 3 template — consistent
- `Guardian` type defined in Task 4, used in Task 5 ChildProfilePage — consistent
- `ChildGuardianSummary` defined in Task 6 types, populated in Task 6 service — consistent
- `listChildrenByGroup` added to children service in Task 3 Step 6, consumed in GroupDetailPage Task 3 Step 7 — consistent
- `getChild` added in Task 5 Step 3, consumed in ChildProfilePage Task 5 Step 6 — consistent
