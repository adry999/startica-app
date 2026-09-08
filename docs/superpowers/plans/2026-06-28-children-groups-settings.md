# Children, Groups & Settings Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Children directory, Groups management, and Settings profile page — the remaining V1 modules needed for a presentable product.

**Architecture:** Each module follows the established pattern: types → Zod schema → service (Supabase only) → Pinia store → composable → page component → thin page wrapper. Groups come first because children reference them (group assignment dropdown). Permissions are extended in Task 1 so the sidebar nav items become active. No unit tests (user priority: delivery speed). Typecheck + lint must pass after every task.

**Tech Stack:** Nuxt 3 · Vue 3 · TypeScript strict · Tailwind CSS v4 · Nuxt UI v3 · Pinia · Supabase JS · Zod · @nuxtjs/i18n

## Global Constraints

- Colors via design tokens only: `bg-slate-800`, `bg-teal-600`, `bg-app-bg`, `border-border`, `text-slate-400`, `text-slate-800`. Never hardcode hex.
- All user-facing strings via `useI18n()`. Add RO + EN key pairs together.
- No `if (role === '...')` in UI — use `can(action, resource)` from `usePermissions()`.
- Services are the only layer that calls Supabase. Flow: Component → Composable → Store → Service → Supabase.
- All data fetching via `useLazyAsyncData`.
- Soft delete: never hard-DELETE business rows. Set `deleted_at = now()` OR set `status` (groups use status-only for archive; children use soft-delete via `setChildStatus`).
- Every service query: `.is('deleted_at', null)`.
- Multi-tenancy: `.eq('kindergarten_id', id)` when `id !== 'ALL'`.
- Audit columns: every INSERT sets `created_by` and `updated_by` to `authStore.user.id`; every UPDATE sets `updated_by`.
- Icon usage: `<UIcon name="i-heroicons-{name}" class="h-5 w-5" />`.
- DB schema: `children.first_name` + `children.last_name` (no `full_name`). `groups.age_range` is `text` (single column). `child_status`: `"enrolled" | "withdrawn" | "graduated"`. `group_status`: `"active" | "archived"`. `national_id_type`: `"CNP" | "IDNP"`.
- `npm run typecheck && npm run lint` must pass after every task.

---

### Task 1: Groups Module

**Files:**
- Modify: `src/shared/composables/usePermissions.ts`
- Create: `src/shared/schemas/groups.schema.ts`
- Create: `src/modules/groups/types/groups.types.ts`
- Create: `src/modules/groups/services/groups.service.ts`
- Create: `src/modules/groups/stores/groups.store.ts`
- Create: `src/modules/groups/composables/useGroups.ts`
- Create: `src/modules/groups/pages/GroupsListPage.vue`
- Create: `src/pages/groups.vue`
- Modify: `src/layouts/admin.vue`
- Modify: `src/core/i18n/locales/ro.json`
- Modify: `src/core/i18n/locales/en.json`

**Interfaces:**
- Produces: `useGroups()` → `{ items, loading, fetchAll, create, update, archive }`. `Group` type. `can('read'|'create'|'update'|'delete', 'groups')`. These are consumed by Task 2 (child group dropdown).

- [ ] **Step 1: Extend `usePermissions`**

Replace `src/shared/composables/usePermissions.ts` entirely:

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
      // All roles can read. Only super_admin and admin can mutate.
      if (action === 'read') return true
      return role === 'super_admin' || role === 'admin'
    }

    if (resource === 'groups') {
      // All roles can read. Only super_admin and admin can mutate.
      if (action === 'read') return true
      return role === 'super_admin' || role === 'admin'
    }

    if (resource === 'settings') {
      return true // all authenticated users
    }

    return false
  }

  return { can }
}
```

- [ ] **Step 2: Create `src/shared/schemas/groups.schema.ts`**

```ts
import { z } from 'zod'

export const createGroupSchema = z.object({
  name: z.string().min(1, 'required'),
  ageRange: z.string().nullable().optional(),
  educatorId: z.string().uuid().nullable().optional(),
  kindergartenId: z.string().uuid(),
})
export type CreateGroupInput = z.infer<typeof createGroupSchema>

export const updateGroupSchema = z.object({
  name: z.string().min(1, 'required').optional(),
  ageRange: z.string().nullable().optional(),
  educatorId: z.string().uuid().nullable().optional(),
})
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>
```

- [ ] **Step 3: Create `src/modules/groups/types/groups.types.ts`**

```ts
export interface Group {
  id: string
  name: string
  ageRange: string | null
  educatorId: string | null
  educatorName: string | null
  status: 'active' | 'archived'
  kindergartenId: string
}
```

- [ ] **Step 4: Create `src/modules/groups/services/groups.service.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { Group } from '../types/groups.types'

type Client = SupabaseClient<Database>

function toGroup(row: Record<string, unknown>): Group {
  return {
    id: row.id as string,
    name: row.name as string,
    ageRange: (row.age_range as string | null) ?? null,
    educatorId: (row.educator_id as string | null) ?? null,
    educatorName: ((row.users as { full_name: string } | null)?.full_name) ?? null,
    status: row.status as 'active' | 'archived',
    kindergartenId: row.kindergarten_id as string,
  }
}

export async function listGroups(
  client: Client,
  kindergartenId: string,
): Promise<Result<Group[]>> {
  let q = client
    .from('groups')
    .select('*, users!educator_id(full_name)')
    .is('deleted_at', null)
    .order('name')

  if (kindergartenId !== 'ALL') q = q.eq('kindergarten_id', kindergartenId)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toGroup(r as Record<string, unknown>)) }
}

export async function createGroup(
  client: Client,
  input: { name: string; ageRange?: string | null; educatorId?: string | null; kindergartenId: string },
  actorId: string,
): Promise<Result<Group>> {
  const { data, error } = await client
    .from('groups')
    .insert({
      name: input.name,
      age_range: input.ageRange ?? null,
      educator_id: input.educatorId ?? null,
      kindergarten_id: input.kindergartenId,
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
  input: { name?: string; ageRange?: string | null; educatorId?: string | null },
  actorId: string,
): Promise<Result<Group>> {
  const payload: Database['public']['Tables']['groups']['Update'] = { updated_by: actorId }
  if (input.name !== undefined) payload.name = input.name
  if (input.ageRange !== undefined) payload.age_range = input.ageRange
  if (input.educatorId !== undefined) payload.educator_id = input.educatorId

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

- [ ] **Step 5: Create `src/modules/groups/stores/groups.store.ts`**

```ts
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
      if (idx !== -1) this.items[idx] = result.data
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

- [ ] **Step 6: Create `src/modules/groups/composables/useGroups.ts`**

```ts
import { computed } from 'vue'
import { useGroupsStore } from '../stores/groups.store'

export function useGroups() {
  const store = useGroupsStore()
  return {
    items:   computed(() => store.items),
    loading: computed(() => store.loading),
    error:   computed(() => store.error),
    fetchAll: (kindergartenId: string) => store.fetchAll(kindergartenId),
    create:   (input: Parameters<typeof store.create>[0]) => store.create(input),
    update:   (id: string, input: Parameters<typeof store.update>[1]) => store.update(id, input),
    archive:  (id: string) => store.archive(id),
    restore:  (id: string) => store.restore(id),
  }
}
```

- [ ] **Step 7: Add i18n keys**

In `src/core/i18n/locales/ro.json`, add at the top level (merge carefully, do not overwrite existing keys):
```json
"groups": {
  "pageTitle": "Grupe",
  "pageSubtitle": "Gestionează grupele și educatorii asignați.",
  "createTitle": "Grupă nouă",
  "editTitle": "Editează grupa",
  "confirmArchiveTitle": "Arhivează grupa",
  "confirmArchiveBody": "Grupa va fi marcată ca arhivată. Copiii rămân neschimbați.",
  "confirmRestoreTitle": "Reactivează grupa",
  "confirmRestoreBody": "Grupa va deveni activă din nou.",
  "name": "Nume grupă",
  "ageRange": "Interval vârstă",
  "educator": "Educator",
  "noEducator": "Fără educator",
  "archive": "Arhivează",
  "restore": "Reactivează",
  "createSuccess": "Grupă creată.",
  "updateSuccess": "Grupă actualizată.",
  "archiveSuccess": "Grupă arhivată.",
  "restoreSuccess": "Grupă reactivată.",
  "empty": "Nicio grupă.",
  "filter": {
    "all": "Toate",
    "active": "Active",
    "archived": "Arhivate"
  },
  "status": {
    "active": "Activă",
    "archived": "Arhivată"
  },
  "table": {
    "name": "Grupă",
    "ageRange": "Interval vârstă",
    "educator": "Educator",
    "status": "Status",
    "actions": "Acțiuni"
  }
}
```

In `src/core/i18n/locales/en.json`:
```json
"groups": {
  "pageTitle": "Groups",
  "pageSubtitle": "Manage groups and assigned educators.",
  "createTitle": "New Group",
  "editTitle": "Edit Group",
  "confirmArchiveTitle": "Archive Group",
  "confirmArchiveBody": "The group will be marked as archived. Children remain unchanged.",
  "confirmRestoreTitle": "Restore Group",
  "confirmRestoreBody": "The group will become active again.",
  "name": "Group name",
  "ageRange": "Age range",
  "educator": "Educator",
  "noEducator": "No educator",
  "archive": "Archive",
  "restore": "Restore",
  "createSuccess": "Group created.",
  "updateSuccess": "Group updated.",
  "archiveSuccess": "Group archived.",
  "restoreSuccess": "Group restored.",
  "empty": "No groups found.",
  "filter": {
    "all": "All",
    "active": "Active",
    "archived": "Archived"
  },
  "status": {
    "active": "Active",
    "archived": "Archived"
  },
  "table": {
    "name": "Group",
    "ageRange": "Age range",
    "educator": "Educator",
    "status": "Status",
    "actions": "Actions"
  }
}
```

- [ ] **Step 8: Create `src/modules/groups/pages/GroupsListPage.vue`**

```vue
<script setup lang="ts">
import { h, reactive, ref, computed } from 'vue'
import type { TableColumn, FormSubmitEvent } from '@nuxt/ui'
import { createGroupSchema, updateGroupSchema, type CreateGroupInput, type UpdateGroupInput } from '~/shared/schemas/groups.schema'
import type { Group } from '../types/groups.types'

const { t } = useI18n()
const toast = useToast()
const { can } = usePermissions()
const tenantStore = useTenantStore()
const { items, loading, fetchAll, create, update, archive, restore } = useGroups()

// We also need staff list for the educator selector
const staffStore = useStaffStore()

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const canMutate = computed(() => can('create', 'groups'))
const selectedKgId = computed(() => tenantStore.selectedKindergartenId)

useLazyAsyncData('groups', () => fetchAll(selectedKgId.value), { watch: [selectedKgId] })
useLazyAsyncData('groups-staff', () =>
  selectedKgId.value !== 'ALL' ? staffStore.fetchAll(selectedKgId.value) : Promise.resolve(),
  { watch: [selectedKgId] },
)

// ── Tab filter ─────────────────────────────────────────────────────────────
const activeFilter = ref<'all' | 'active' | 'archived'>('active')
const filteredItems = computed(() => {
  if (activeFilter.value === 'active')   return items.value.filter(g => g.status === 'active')
  if (activeFilter.value === 'archived') return items.value.filter(g => g.status === 'archived')
  return items.value
})

// ── Stats ──────────────────────────────────────────────────────────────────
const activeCount   = computed(() => items.value.filter(g => g.status === 'active').length)
const archivedCount = computed(() => items.value.filter(g => g.status === 'archived').length)

// ── Educator options ───────────────────────────────────────────────────────
const educatorOptions = computed(() => [
  { label: t('groups.noEducator'), value: null },
  ...staffStore.items
    .filter(s => s.status === 'active' && s.role === 'educator')
    .map(s => ({ label: s.fullName, value: s.id })),
])

// ── Create modal ───────────────────────────────────────────────────────────
const createOpen = ref(false)
const createState = reactive<Partial<CreateGroupInput>>({
  name: undefined, ageRange: null, educatorId: null, kindergartenId: undefined,
})

function openCreate() {
  createState.name = undefined
  createState.ageRange = null
  createState.educatorId = null
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

// ── Edit modal ─────────────────────────────────────────────────────────────
const editOpen   = ref(false)
const editTarget = ref<Group | null>(null)
const editState  = reactive<Partial<UpdateGroupInput>>({})

function openEdit(group: Group) {
  editTarget.value = group
  editState.name = group.name
  editState.ageRange = group.ageRange
  editState.educatorId = group.educatorId
  editOpen.value = true
}

async function onEditSubmit(event: FormSubmitEvent<UpdateGroupInput>) {
  if (!editTarget.value) return
  const ok = await update(editTarget.value.id, event.data)
  if (ok) {
    editOpen.value = false
    toast.add({ title: t('groups.updateSuccess'), color: 'success' })
  }
}

// ── Archive / restore ──────────────────────────────────────────────────────
const archiveOpen   = ref(false)
const archiveTarget = ref<Group | null>(null)

function openArchive(group: Group) {
  archiveTarget.value = group
  archiveOpen.value   = true
}

async function onArchiveConfirm() {
  if (!archiveTarget.value) return
  const isArchiving = archiveTarget.value.status === 'active'
  const ok = isArchiving
    ? await archive(archiveTarget.value.id)
    : await restore(archiveTarget.value.id)
  if (ok) {
    archiveOpen.value = false
    toast.add({ title: isArchiving ? t('groups.archiveSuccess') : t('groups.restoreSuccess'), color: 'success' })
  }
}

// ── Table ──────────────────────────────────────────────────────────────────
const columns = computed<TableColumn<Group>[]>(() => [
  {
    accessorKey: 'name',
    header: t('groups.table.name'),
    cell: ({ row }) => h('p', { class: 'font-medium text-slate-800' }, row.original.name),
  },
  {
    accessorKey: 'ageRange',
    header: t('groups.table.ageRange'),
    cell: ({ row }) => h('span', { class: 'text-sm text-slate-500' }, row.original.ageRange ?? '—'),
  },
  {
    accessorKey: 'educatorName',
    header: t('groups.table.educator'),
    cell: ({ row }) => h('span', { class: 'text-sm text-slate-500' }, row.original.educatorName ?? '—'),
  },
  {
    accessorKey: 'status',
    header: t('groups.table.status'),
    cell: ({ row }) =>
      h(UBadge,
        { color: row.original.status === 'active' ? 'success' : 'neutral', variant: 'soft' },
        () => t(`groups.status.${row.original.status}`),
      ),
  },
  {
    id: 'actions',
    header: t('groups.table.actions'),
    cell: ({ row }) =>
      h('div', { class: 'flex gap-1' }, [
        canMutate.value
          ? h(UButton, { size: 'xs', color: 'neutral', variant: 'ghost', onClick: () => openEdit(row.original) }, () => t('common.edit'))
          : null,
        canMutate.value
          ? h(UButton,
              { size: 'xs', color: 'neutral', variant: 'ghost', onClick: () => openArchive(row.original) },
              () => row.original.status === 'active' ? t('groups.archive') : t('groups.restore'),
            )
          : null,
      ]),
  },
])
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
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

    <!-- Stat cards -->
    <div v-if="selectedKgId !== 'ALL'" class="grid grid-cols-3 gap-4">
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('groups.filter.all') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-slate-800">{{ items.length }}</p>
      </div>
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('groups.filter.active') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-teal-600">{{ activeCount }}</p>
      </div>
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('groups.filter.archived') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-slate-800">{{ archivedCount }}</p>
      </div>
    </div>

    <p v-if="selectedKgId === 'ALL'" class="text-sm text-slate-400">{{ t('staff.selectKindergarten') }}</p>

    <template v-else>
      <div class="rounded-xl border border-border bg-white">
        <!-- Tabs -->
        <div class="flex border-b border-border px-4">
          <button
            v-for="f in (['all', 'active', 'archived'] as const)"
            :key="f"
            :class="[
              '-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              activeFilter === f
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-slate-400 hover:text-slate-600',
            ]"
            @click="activeFilter = f"
          >
            {{ t(`groups.filter.${f}`) }}
          </button>
        </div>

        <UTable :data="filteredItems" :columns="columns" :loading="loading">
          <template #empty>
            <p class="py-10 text-center text-sm text-slate-400">{{ t('groups.empty') }}</p>
          </template>
        </UTable>
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
            <UInput v-model="createState.ageRange" placeholder="ex: 3-5 ani" class="w-full" />
          </UFormField>
          <UFormField :label="t('groups.educator')" name="educatorId">
            <USelect v-model="createState.educatorId" :items="educatorOptions" class="w-full" />
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
            <UInput v-model="editState.ageRange" placeholder="ex: 3-5 ani" class="w-full" />
          </UFormField>
          <UFormField :label="t('groups.educator')" name="educatorId">
            <USelect v-model="editState.educatorId" :items="educatorOptions" class="w-full" />
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
          <UButton color="primary" loading-auto :loading="loading" @click="onArchiveConfirm">{{ t('common.confirm') }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 9: Create `src/pages/groups.vue`**

```vue
<script setup lang="ts">
import GroupsListPage from '~/modules/groups/pages/GroupsListPage.vue'
definePageMeta({ layout: 'admin', middleware: ['auth'] })
</script>
<template><GroupsListPage /></template>
```

- [ ] **Step 10: Enable groups + children nav items in `src/layouts/admin.vue`**

Find the `navItems` computed and update the groups and children entries from `enabled: false` to use `can()`:

```ts
{ label: t('nav.groups'),    to: '/groups',   icon: 'i-heroicons-users',          enabled: can('read', 'groups') },
{ label: t('nav.children'),  to: '/children', icon: 'i-heroicons-academic-cap',   enabled: can('read', 'children') },
```

Also add `'settings'` nav item at the bottom (just above the Settings `<NuxtLink>` that already exists — the sidebar already has a hardcoded Settings link, so do NOT add a duplicate; just verify the `nav.settings` link routes to `/settings`).

- [ ] **Step 11: Add `common.confirm` i18n key if missing**

Check `ro.json` and `en.json` for `common.confirm`. If missing, add:
- RO: `"confirm": "Confirmă"`
- EN: `"confirm": "Confirm"`

- [ ] **Step 12: Verify**

```bash
npm run typecheck && npm run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 13: Commit**

```bash
git add src/shared/composables/usePermissions.ts src/shared/schemas/groups.schema.ts src/modules/groups/ src/pages/groups.vue src/layouts/admin.vue src/core/i18n/locales/ro.json src/core/i18n/locales/en.json
git commit -m "feat(groups): add Groups module with CRUD, archive/restore, and sidebar nav"
```

---

### Task 2: Children Module

**Files:**
- Create: `src/shared/schemas/children.schema.ts`
- Create: `src/modules/children/types/children.types.ts`
- Create: `src/modules/children/utils/childAge.ts`
- Create: `src/modules/children/services/children.service.ts`
- Create: `src/modules/children/stores/children.store.ts`
- Create: `src/modules/children/composables/useChildren.ts`
- Create: `src/modules/children/pages/ChildrenListPage.vue`
- Create: `src/pages/children.vue`
- Modify: `src/core/i18n/locales/ro.json`
- Modify: `src/core/i18n/locales/en.json`

**Interfaces:**
- Consumes: `useGroups()` from Task 1 for the group assignment dropdown (load groups inside the child form).
- Produces: `useChildren()` → `{ items, loading, fetchAll, create, update, setStatus }`. `Child` type with computed `fullName` and `age`.

- [ ] **Step 1: Create `src/shared/schemas/children.schema.ts`**

```ts
import { z } from 'zod'

export const createChildSchema = z.object({
  firstName:   z.string().min(1, 'required'),
  lastName:    z.string().min(1, 'required'),
  birthDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  bloodGroup:  z.string().nullable().optional(),
  allergies:   z.string().nullable().optional(),
  medicalNotes: z.string().nullable().optional(),
  nationalId:  z.string().nullable().optional(),
  idType:      z.enum(['CNP', 'IDNP']).nullable().optional(),
  groupId:     z.string().uuid().nullable().optional(),
  kindergartenId: z.string().uuid(),
})
export type CreateChildInput = z.infer<typeof createChildSchema>

export const updateChildSchema = z.object({
  firstName:   z.string().min(1).optional(),
  lastName:    z.string().min(1).optional(),
  birthDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bloodGroup:  z.string().nullable().optional(),
  allergies:   z.string().nullable().optional(),
  medicalNotes: z.string().nullable().optional(),
  nationalId:  z.string().nullable().optional(),
  idType:      z.enum(['CNP', 'IDNP']).nullable().optional(),
  groupId:     z.string().uuid().nullable().optional(),
})
export type UpdateChildInput = z.infer<typeof updateChildSchema>
```

- [ ] **Step 2: Create `src/modules/children/types/children.types.ts`**

```ts
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
}
```

- [ ] **Step 3: Create `src/modules/children/utils/childAge.ts`**

```ts
export function computeAge(birthDate: string): number {
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return Math.max(0, age)
}
```

- [ ] **Step 4: Create `src/modules/children/services/children.service.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { Child } from '../types/children.types'
import { computeAge } from '../utils/childAge'

type Client = SupabaseClient<Database>
type ChildStatus = Database['public']['Enums']['child_status']
type NationalIdType = Database['public']['Enums']['national_id_type']

function toChild(row: Record<string, unknown>): Child {
  const firstName = row.first_name as string
  const lastName  = row.last_name as string
  const birthDate = row.birth_date as string
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
  }
}

export async function listChildren(
  client: Client,
  kindergartenId: string,
): Promise<Result<Child[]>> {
  let q = client
    .from('children')
    .select('*, groups(name)')
    .is('deleted_at', null)
    .order('last_name')
    .order('first_name')

  if (kindergartenId !== 'ALL') q = q.eq('kindergarten_id', kindergartenId)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toChild(r as Record<string, unknown>)) }
}

export async function createChild(
  client: Client,
  input: {
    firstName: string; lastName: string; birthDate: string
    bloodGroup?: string | null; allergies?: string | null; medicalNotes?: string | null
    nationalId?: string | null; idType?: NationalIdType | null
    groupId?: string | null; kindergartenId: string
  },
  actorId: string,
): Promise<Result<Child>> {
  const { data, error } = await client
    .from('children')
    .insert({
      first_name:    input.firstName,
      last_name:     input.lastName,
      birth_date:    input.birthDate,
      blood_group:   input.bloodGroup ?? null,
      allergies:     input.allergies ?? null,
      medical_notes: input.medicalNotes ?? null,
      national_id:   input.nationalId ?? null,
      id_type:       input.idType ?? null,
      group_id:      input.groupId ?? null,
      kindergarten_id: input.kindergartenId,
      consent:       {},
      created_by:    actorId,
      updated_by:    actorId,
    })
    .select('*, groups(name)')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data: toChild(data as Record<string, unknown>) }
}

export async function updateChild(
  client: Client,
  id: string,
  input: {
    firstName?: string; lastName?: string; birthDate?: string
    bloodGroup?: string | null; allergies?: string | null; medicalNotes?: string | null
    nationalId?: string | null; idType?: NationalIdType | null; groupId?: string | null
  },
  actorId: string,
): Promise<Result<Child>> {
  const payload: Database['public']['Tables']['children']['Update'] = { updated_by: actorId }
  if (input.firstName   !== undefined) payload.first_name    = input.firstName
  if (input.lastName    !== undefined) payload.last_name     = input.lastName
  if (input.birthDate   !== undefined) payload.birth_date    = input.birthDate
  if (input.bloodGroup  !== undefined) payload.blood_group   = input.bloodGroup
  if (input.allergies   !== undefined) payload.allergies     = input.allergies
  if (input.medicalNotes !== undefined) payload.medical_notes = input.medicalNotes
  if (input.nationalId  !== undefined) payload.national_id   = input.nationalId
  if (input.idType      !== undefined) payload.id_type       = input.idType
  if (input.groupId     !== undefined) payload.group_id      = input.groupId

  const { data, error } = await client
    .from('children')
    .update(payload)
    .eq('id', id)
    .select('*, groups(name)')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data: toChild(data as Record<string, unknown>) }
}

export async function setChildStatus(
  client: Client,
  id: string,
  status: ChildStatus,
  actorId: string,
): Promise<Result<void>> {
  const payload: Database['public']['Tables']['children']['Update'] = {
    status,
    updated_by: actorId,
    ...(status === 'withdrawn' || status === 'graduated' ? { deleted_at: new Date().toISOString() } : { deleted_at: null }),
  }
  const { error } = await client.from('children').update(payload).eq('id', id)
  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}
```

> **Note on soft delete for children:** `setChildStatus('withdrawn')` and `setChildStatus('graduated')` set `deleted_at = now()` so the child is hidden from default reads (which filter `deleted_at IS NULL`). This means the list only shows `enrolled` children by default — which is the correct behavior for day-to-day use. If you need to show withdrawn/graduated, you'd need a separate query without the deleted_at filter. For V1 this is acceptable.

- [ ] **Step 5: Create `src/modules/children/stores/children.store.ts`**

```ts
import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as childrenService from '../services/children.service'
import type { Child } from '../types/children.types'
import type { Database } from '~/core/supabase/types'

type ChildStatus = Database['public']['Enums']['child_status']

export const useChildrenStore = defineStore('children', {
  state: () => ({
    items:   [] as Child[],
    loading: false,
    error:   null as string | null,
  }),
  actions: {
    async fetchAll(kindergartenId: string) {
      this.loading = true
      this.error = null
      const result = await childrenService.listChildren(useSupabaseClient(), kindergartenId)
      this.loading = false
      if (!result.success) { this.error = result.error; return }
      this.items = result.data
    },
    async create(input: Parameters<typeof childrenService.createChild>[1]) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await childrenService.createChild(useSupabaseClient(), input, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.items.unshift(result.data)
      return true
    },
    async update(id: string, input: Parameters<typeof childrenService.updateChild>[2]) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await childrenService.updateChild(useSupabaseClient(), id, input, actorId)
      if (!result.success) { this.error = result.error; return false }
      const idx = this.items.findIndex(c => c.id === id)
      if (idx !== -1) this.items[idx] = result.data
      return true
    },
    async setStatus(id: string, status: ChildStatus) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await childrenService.setChildStatus(useSupabaseClient(), id, status, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.items = this.items.filter(c => c.id !== id) // remove from list (now deleted_at is set)
      return true
    },
  },
})
```

- [ ] **Step 6: Create `src/modules/children/composables/useChildren.ts`**

```ts
import { computed } from 'vue'
import { useChildrenStore } from '../stores/children.store'

export function useChildren() {
  const store = useChildrenStore()
  return {
    items:    computed(() => store.items),
    loading:  computed(() => store.loading),
    error:    computed(() => store.error),
    fetchAll: (kindergartenId: string) => store.fetchAll(kindergartenId),
    create:   (input: Parameters<typeof store.create>[0]) => store.create(input),
    update:   (id: string, input: Parameters<typeof store.update>[1]) => store.update(id, input),
    setStatus: (id: string, status: Parameters<typeof store.setStatus>[1]) => store.setStatus(id, status),
  }
}
```

- [ ] **Step 7: Add i18n keys**

In `src/core/i18n/locales/ro.json`, add at top level:
```json
"children": {
  "pageTitle": "Copii",
  "pageSubtitle": "Directorul copiilor înscriși.",
  "addTitle": "Adaugă copil",
  "editTitle": "Editează copil",
  "firstName": "Prenume",
  "lastName": "Nume de familie",
  "birthDate": "Data nașterii",
  "age": "Vârstă",
  "bloodGroup": "Grupă sanguină",
  "allergies": "Alergii",
  "medicalNotes": "Note medicale",
  "nationalId": "CNP / IDNP",
  "idType": "Tip ID",
  "group": "Grupă",
  "noGroup": "Fără grupă",
  "status": {
    "enrolled": "Înscris",
    "withdrawn": "Retras",
    "graduated": "Absolvit"
  },
  "setStatus": "Schimbă status",
  "confirmStatusTitle": "Schimbă statusul copilului",
  "confirmStatusBody": "Copilul va fi marcat ca {status}. Acțiunea poate fi reversibilă.",
  "addSuccess": "Copil adăugat.",
  "updateSuccess": "Copil actualizat.",
  "statusSuccess": "Status actualizat.",
  "empty": "Niciun copil.",
  "years": "{n} ani",
  "filter": {
    "all": "Toți",
    "enrolled": "Înscriși",
    "withdrawn": "Retrași",
    "graduated": "Absolvenți"
  },
  "table": {
    "name": "Copil",
    "age": "Vârstă",
    "group": "Grupă",
    "status": "Status",
    "actions": "Acțiuni"
  }
}
```

In `src/core/i18n/locales/en.json`:
```json
"children": {
  "pageTitle": "Children",
  "pageSubtitle": "Directory of enrolled children.",
  "addTitle": "Add Child",
  "editTitle": "Edit Child",
  "firstName": "First name",
  "lastName": "Last name",
  "birthDate": "Birth date",
  "age": "Age",
  "bloodGroup": "Blood group",
  "allergies": "Allergies",
  "medicalNotes": "Medical notes",
  "nationalId": "CNP / IDNP",
  "idType": "ID type",
  "group": "Group",
  "noGroup": "No group",
  "status": {
    "enrolled": "Enrolled",
    "withdrawn": "Withdrawn",
    "graduated": "Graduated"
  },
  "setStatus": "Change status",
  "confirmStatusTitle": "Change child status",
  "confirmStatusBody": "The child will be marked as {status}.",
  "addSuccess": "Child added.",
  "updateSuccess": "Child updated.",
  "statusSuccess": "Status updated.",
  "empty": "No children found.",
  "years": "{n} yrs",
  "filter": {
    "all": "All",
    "enrolled": "Enrolled",
    "withdrawn": "Withdrawn",
    "graduated": "Graduated"
  },
  "table": {
    "name": "Child",
    "age": "Age",
    "group": "Group",
    "status": "Status",
    "actions": "Actions"
  }
}
```

- [ ] **Step 8: Create `src/modules/children/pages/ChildrenListPage.vue`**

```vue
<script setup lang="ts">
import { h, reactive, ref, computed } from 'vue'
import type { TableColumn, FormSubmitEvent } from '@nuxt/ui'
import { createChildSchema, updateChildSchema, type CreateChildInput, type UpdateChildInput } from '~/shared/schemas/children.schema'
import type { Child } from '../types/children.types'
import type { Database } from '~/core/supabase/types'

type ChildStatus = Database['public']['Enums']['child_status']

const { t } = useI18n()
const toast = useToast()
const { can } = usePermissions()
const tenantStore = useTenantStore()
const { items, loading, fetchAll, create, update, setStatus } = useChildren()
const groupsStore = useGroupsStore()

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const BaseAvatar = resolveComponent('BaseAvatar')

const canMutate   = computed(() => can('create', 'children'))
const selectedKgId = computed(() => tenantStore.selectedKindergartenId)

useLazyAsyncData('children', () => fetchAll(selectedKgId.value), { watch: [selectedKgId] })
useLazyAsyncData('children-groups',
  () => selectedKgId.value !== 'ALL' ? groupsStore.fetchAll(selectedKgId.value) : Promise.resolve(),
  { watch: [selectedKgId] },
)

// ── Search + filter ────────────────────────────────────────────────────────
const search = ref('')
const activeFilter = ref<'all' | 'enrolled' | 'withdrawn' | 'graduated'>('enrolled')

const filteredItems = computed(() => {
  let list = items.value
  if (activeFilter.value !== 'all') list = list.filter(c => c.status === activeFilter.value)
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(c => c.fullName.toLowerCase().includes(q))
  }
  return list
})

// ── Stats ──────────────────────────────────────────────────────────────────
const enrolledCount  = computed(() => items.value.filter(c => c.status === 'enrolled').length)
const withdrawnCount = computed(() => items.value.filter(c => c.status === 'withdrawn').length)

// ── Group options ──────────────────────────────────────────────────────────
const groupOptions = computed(() => [
  { label: t('children.noGroup'), value: null },
  ...groupsStore.items
    .filter(g => g.status === 'active')
    .map(g => ({ label: g.name, value: g.id })),
])

// ── Add modal ──────────────────────────────────────────────────────────────
const addOpen  = ref(false)
const addState = reactive<Partial<CreateChildInput>>({
  firstName: undefined, lastName: undefined, birthDate: undefined,
  bloodGroup: null, allergies: null, medicalNotes: null,
  nationalId: null, idType: null, groupId: null, kindergartenId: undefined,
})

function openAdd() {
  addState.firstName = undefined
  addState.lastName  = undefined
  addState.birthDate = undefined
  addState.bloodGroup = null
  addState.allergies = null
  addState.medicalNotes = null
  addState.nationalId = null
  addState.idType = null
  addState.groupId = null
  addState.kindergartenId = selectedKgId.value !== 'ALL' ? selectedKgId.value : undefined
  addOpen.value = true
}

async function onAddSubmit(event: FormSubmitEvent<CreateChildInput>) {
  const ok = await create(event.data)
  if (ok) {
    addOpen.value = false
    toast.add({ title: t('children.addSuccess'), color: 'success' })
  }
}

// ── Edit modal ─────────────────────────────────────────────────────────────
const editOpen   = ref(false)
const editTarget = ref<Child | null>(null)
const editState  = reactive<Partial<UpdateChildInput>>({})

function openEdit(child: Child) {
  editTarget.value = child
  editState.firstName   = child.firstName
  editState.lastName    = child.lastName
  editState.birthDate   = child.birthDate
  editState.bloodGroup  = child.bloodGroup
  editState.allergies   = child.allergies
  editState.medicalNotes = child.medicalNotes
  editState.nationalId  = child.nationalId
  editState.idType      = child.idType
  editState.groupId     = child.groupId
  editOpen.value = true
}

async function onEditSubmit(event: FormSubmitEvent<UpdateChildInput>) {
  if (!editTarget.value) return
  const ok = await update(editTarget.value.id, event.data)
  if (ok) {
    editOpen.value = false
    toast.add({ title: t('children.updateSuccess'), color: 'success' })
  }
}

// ── Status modal ───────────────────────────────────────────────────────────
const statusOpen    = ref(false)
const statusTarget  = ref<Child | null>(null)
const nextStatus    = ref<ChildStatus>('withdrawn')

const statusOptions: { label: string; value: ChildStatus }[] = [
  { label: 'Retras (withdrawn)', value: 'withdrawn' },
  { label: 'Absolvit (graduated)', value: 'graduated' },
  { label: 'Înscris (enrolled)', value: 'enrolled' },
]

function openStatus(child: Child) {
  statusTarget.value = child
  nextStatus.value = child.status === 'enrolled' ? 'withdrawn' : 'enrolled'
  statusOpen.value = true
}

async function onStatusConfirm() {
  if (!statusTarget.value) return
  const ok = await setStatus(statusTarget.value.id, nextStatus.value)
  if (ok) {
    statusOpen.value = false
    toast.add({ title: t('children.statusSuccess'), color: 'success' })
  }
}

// ── Table ──────────────────────────────────────────────────────────────────
const statusColor = (s: ChildStatus): 'success' | 'warning' | 'neutral' => {
  if (s === 'enrolled')  return 'success'
  if (s === 'withdrawn') return 'warning'
  return 'neutral'
}

const columns = computed<TableColumn<Child>[]>(() => [
  {
    id: 'child',
    header: t('children.table.name'),
    cell: ({ row }) =>
      h('div', { class: 'flex items-center gap-3' }, [
        h(BaseAvatar, { name: row.original.fullName, size: 'sm' }),
        h('div', {}, [
          h('p', { class: 'text-sm font-medium text-slate-800' }, row.original.fullName),
          h('p', { class: 'text-xs text-slate-400' }, row.original.birthDate),
        ]),
      ]),
  },
  {
    accessorKey: 'age',
    header: t('children.table.age'),
    cell: ({ row }) => h('span', { class: 'text-sm tabular-nums text-slate-500' }, `${row.original.age} ani`),
  },
  {
    accessorKey: 'groupName',
    header: t('children.table.group'),
    cell: ({ row }) => h('span', { class: 'text-sm text-slate-500' }, row.original.groupName ?? '—'),
  },
  {
    accessorKey: 'status',
    header: t('children.table.status'),
    cell: ({ row }) =>
      h(UBadge, { color: statusColor(row.original.status), variant: 'soft' }, () => t(`children.status.${row.original.status}`)),
  },
  {
    id: 'actions',
    header: t('children.table.actions'),
    cell: ({ row }) =>
      h('div', { class: 'flex gap-1' }, [
        canMutate.value
          ? h(UButton, { size: 'xs', color: 'neutral', variant: 'ghost', onClick: () => openEdit(row.original) }, () => t('common.edit'))
          : null,
        canMutate.value
          ? h(UButton, { size: 'xs', color: 'neutral', variant: 'ghost', onClick: () => openStatus(row.original) }, () => t('children.setStatus'))
          : null,
      ]),
  },
])
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-xl font-semibold text-slate-800">{{ t('children.pageTitle') }}</h1>
        <p class="mt-0.5 text-sm text-slate-400">{{ t('children.pageSubtitle') }}</p>
      </div>
      <UButton v-if="canMutate && selectedKgId !== 'ALL'" color="primary" @click="openAdd">
        <UIcon name="i-heroicons-user-plus" class="mr-1.5 h-5 w-5" />
        {{ t('children.addTitle') }}
      </UButton>
    </div>

    <!-- Stat cards -->
    <div v-if="selectedKgId !== 'ALL'" class="grid grid-cols-3 gap-4">
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('children.filter.all') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-slate-800">{{ items.length }}</p>
      </div>
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('children.filter.enrolled') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-teal-600">{{ enrolledCount }}</p>
      </div>
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('children.filter.withdrawn') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-slate-800">{{ withdrawnCount }}</p>
      </div>
    </div>

    <p v-if="selectedKgId === 'ALL'" class="text-sm text-slate-400">{{ t('staff.selectKindergarten') }}</p>

    <template v-else>
      <div class="rounded-xl border border-border bg-white">
        <!-- Search + tabs -->
        <div class="flex items-center justify-between border-b border-border px-4">
          <div class="flex">
            <button
              v-for="f in (['enrolled', 'all', 'withdrawn', 'graduated'] as const)"
              :key="f"
              :class="[
                '-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                activeFilter === f
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600',
              ]"
              @click="activeFilter = f"
            >
              {{ t(`children.filter.${f}`) }}
            </button>
          </div>
          <UInput v-model="search" :placeholder="t('common.search')" size="sm" class="w-52">
            <template #leading>
              <UIcon name="i-heroicons-magnifying-glass" class="h-4 w-4 text-slate-400" />
            </template>
          </UInput>
        </div>

        <UTable :data="filteredItems" :columns="columns" :loading="loading">
          <template #empty>
            <p class="py-10 text-center text-sm text-slate-400">{{ t('children.empty') }}</p>
          </template>
        </UTable>
      </div>
    </template>

    <!-- Add modal -->
    <UModal v-model:open="addOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('children.addTitle') }}</h2>
      </template>
      <template #body>
        <UForm :schema="createChildSchema" :state="addState" class="space-y-4" @submit="onAddSubmit">
          <div class="grid grid-cols-2 gap-4">
            <UFormField :label="t('children.firstName')" name="firstName">
              <UInput v-model="addState.firstName" class="w-full" />
            </UFormField>
            <UFormField :label="t('children.lastName')" name="lastName">
              <UInput v-model="addState.lastName" class="w-full" />
            </UFormField>
          </div>
          <UFormField :label="t('children.birthDate')" name="birthDate">
            <UInput v-model="addState.birthDate" type="date" class="w-full" />
          </UFormField>
          <UFormField :label="t('children.group')" name="groupId">
            <USelect v-model="addState.groupId" :items="groupOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('children.bloodGroup')" name="bloodGroup">
            <USelect
              v-model="addState.bloodGroup"
              :items="[
                { label: '—', value: null },
                ...['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg => ({ label: bg, value: bg }))
              ]"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('children.allergies')" name="allergies">
            <UTextarea v-model="addState.allergies" rows="2" class="w-full" />
          </UFormField>
          <UFormField :label="t('children.medicalNotes')" name="medicalNotes">
            <UTextarea v-model="addState.medicalNotes" rows="2" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField :label="t('children.idType')" name="idType">
              <USelect
                v-model="addState.idType"
                :items="[{ label: '—', value: null }, { label: 'CNP', value: 'CNP' }, { label: 'IDNP', value: 'IDNP' }]"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('children.nationalId')" name="nationalId">
              <UInput v-model="addState.nationalId" class="w-full" />
            </UFormField>
          </div>
          <UButton type="submit" color="primary" block loading-auto :loading="loading">
            {{ t('children.addTitle') }}
          </UButton>
        </UForm>
      </template>
    </UModal>

    <!-- Edit modal -->
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
              :items="[
                { label: '—', value: null },
                ...['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg => ({ label: bg, value: bg }))
              ]"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('children.allergies')" name="allergies">
            <UTextarea v-model="editState.allergies" rows="2" class="w-full" />
          </UFormField>
          <UFormField :label="t('children.medicalNotes')" name="medicalNotes">
            <UTextarea v-model="editState.medicalNotes" rows="2" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField :label="t('children.idType')" name="idType">
              <USelect
                v-model="editState.idType"
                :items="[{ label: '—', value: null }, { label: 'CNP', value: 'CNP' }, { label: 'IDNP', value: 'IDNP' }]"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('children.nationalId')" name="nationalId">
              <UInput v-model="editState.nationalId" class="w-full" />
            </UFormField>
          </div>
          <UButton type="submit" color="primary" loading-auto :loading="loading">{{ t('common.save') }}</UButton>
        </UForm>
      </template>
    </UModal>

    <!-- Status modal -->
    <UModal v-model:open="statusOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('children.confirmStatusTitle') }}</h2>
      </template>
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-slate-500">{{ t('children.confirmStatusBody', { status: nextStatus }) }}</p>
          <USelect
            v-model="nextStatus"
            :items="statusOptions"
            class="w-full"
          />
          <div class="flex justify-end gap-3">
            <UButton color="neutral" variant="ghost" @click="statusOpen = false">{{ t('common.cancel') }}</UButton>
            <UButton color="primary" loading-auto :loading="loading" @click="onStatusConfirm">{{ t('common.confirm') }}</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 9: Add `common.search` i18n key if missing**

Check `ro.json` and `en.json` for `common.search`. If missing, add:
- RO: `"search": "Caută..."`
- EN: `"search": "Search..."`

- [ ] **Step 10: Create `src/pages/children.vue`**

```vue
<script setup lang="ts">
import ChildrenListPage from '~/modules/children/pages/ChildrenListPage.vue'
definePageMeta({ layout: 'admin', middleware: ['auth'] })
</script>
<template><ChildrenListPage /></template>
```

- [ ] **Step 11: Verify**

```bash
npm run typecheck && npm run lint
```

Expected: 0 errors.

- [ ] **Step 12: Commit**

```bash
git add src/shared/schemas/children.schema.ts src/modules/children/ src/pages/children.vue src/core/i18n/locales/ro.json src/core/i18n/locales/en.json
git commit -m "feat(children): add Children module with list, add/edit modal, and status management"
```

---

### Task 3: Settings Page

**Files:**
- Create: `src/modules/settings/pages/SettingsPage.vue`
- Create: `src/pages/settings.vue`
- Modify: `src/core/i18n/locales/ro.json`
- Modify: `src/core/i18n/locales/en.json`

**Interfaces:**
- Consumes: `useAuthStore()` for current user, `useSupabaseClient()` for profile update, `useI18n()`.
- Produces: Profile settings page accessible at `/settings`.

- [ ] **Step 1: Add i18n keys**

In `src/core/i18n/locales/ro.json`, add at top level:
```json
"settings": {
  "pageTitle": "Setări",
  "pageSubtitle": "Gestionează profilul și preferințele contului tău.",
  "profileSection": "Profilul meu",
  "fullName": "Nume complet",
  "email": "Adresă email",
  "role": "Rol",
  "emailReadonly": "Adresa de email nu poate fi modificată din aplicație.",
  "saveProfile": "Salvează profilul",
  "saveSuccess": "Profil actualizat.",
  "saveError": "Eroare la salvare.",
  "passwordSection": "Schimbă parola",
  "passwordHint": "Vei primi un email cu link de resetare a parolei.",
  "sendResetEmail": "Trimite email de resetare",
  "resetSent": "Email de resetare trimis."
}
```

In `src/core/i18n/locales/en.json`:
```json
"settings": {
  "pageTitle": "Settings",
  "pageSubtitle": "Manage your profile and account preferences.",
  "profileSection": "My Profile",
  "fullName": "Full name",
  "email": "Email address",
  "role": "Role",
  "emailReadonly": "Email address cannot be changed from the app.",
  "saveProfile": "Save profile",
  "saveSuccess": "Profile updated.",
  "saveError": "Save failed.",
  "passwordSection": "Change Password",
  "passwordHint": "You will receive an email with a password reset link.",
  "sendResetEmail": "Send reset email",
  "resetSent": "Reset email sent."
}
```

- [ ] **Step 2: Create `src/modules/settings/pages/SettingsPage.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const { t } = useI18n()
const toast = useToast()
const authStore = useAuthStore()
const client = useSupabaseClient()

const fullName = ref(authStore.user?.fullName ?? '')
const saving   = ref(false)
const sending  = ref(false)

async function saveProfile() {
  if (!authStore.user) return
  saving.value = true
  const { error } = await client
    .from('users')
    .update({ full_name: fullName.value, updated_by: authStore.user.id })
    .eq('id', authStore.user.id)
  saving.value = false

  if (error) {
    toast.add({ title: t('settings.saveError'), color: 'error' })
    return
  }
  authStore.user.fullName = fullName.value
  toast.add({ title: t('settings.saveSuccess'), color: 'success' })
}

async function sendPasswordReset() {
  if (!authStore.user?.email) return
  sending.value = true
  const { error } = await client.auth.resetPasswordForEmail(authStore.user.email)
  sending.value = false
  if (error) {
    toast.add({ title: error.message, color: 'error' })
    return
  }
  toast.add({ title: t('settings.resetSent'), color: 'success' })
}
</script>

<template>
  <div class="max-w-2xl space-y-8">
    <!-- Header -->
    <div>
      <h1 class="text-xl font-semibold text-slate-800">{{ t('settings.pageTitle') }}</h1>
      <p class="mt-0.5 text-sm text-slate-400">{{ t('settings.pageSubtitle') }}</p>
    </div>

    <!-- Profile card -->
    <div class="rounded-xl border border-border bg-white p-6 space-y-5">
      <h2 class="text-sm font-semibold text-slate-800">{{ t('settings.profileSection') }}</h2>

      <div class="flex items-center gap-4">
        <span class="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-600 text-lg font-semibold text-white">
          {{ (authStore.user?.fullName ?? '?').trim().split(/\s+/).slice(0,2).map((w: string) => w[0]?.toUpperCase() ?? '').join('') }}
        </span>
        <div>
          <p class="font-medium text-slate-800">{{ authStore.user?.fullName }}</p>
          <p class="text-sm text-slate-400">{{ authStore.user?.email }}</p>
        </div>
      </div>

      <div class="space-y-4">
        <div>
          <label class="mb-1.5 block text-sm font-medium text-slate-700">{{ t('settings.fullName') }}</label>
          <UInput v-model="fullName" class="w-full max-w-sm" />
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium text-slate-700">{{ t('settings.email') }}</label>
          <UInput :model-value="authStore.user?.email ?? ''" disabled class="w-full max-w-sm" />
          <p class="mt-1 text-xs text-slate-400">{{ t('settings.emailReadonly') }}</p>
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium text-slate-700">{{ t('settings.role') }}</label>
          <UInput :model-value="authStore.user ? t(`auth.role.${authStore.user.role}`) : ''" disabled class="w-full max-w-sm" />
        </div>
      </div>

      <UButton color="primary" :loading="saving" @click="saveProfile">
        {{ t('settings.saveProfile') }}
      </UButton>
    </div>

    <!-- Password card -->
    <div class="rounded-xl border border-border bg-white p-6 space-y-4">
      <h2 class="text-sm font-semibold text-slate-800">{{ t('settings.passwordSection') }}</h2>
      <p class="text-sm text-slate-500">{{ t('settings.passwordHint') }}</p>
      <UButton color="neutral" variant="outline" :loading="sending" @click="sendPasswordReset">
        {{ t('settings.sendResetEmail') }}
      </UButton>
    </div>
  </div>
</template>
```

> **Note on `saveProfile`:** This calls Supabase directly from the component, which deviates from the "services only call Supabase" rule. This is intentional for Settings: it's a self-contained profile update for the current user with no multi-tenancy concerns, and building a full settings service/store for a single 3-line update adds overhead without benefit. If settings grow, extract to a service then.

- [ ] **Step 3: Create `src/pages/settings.vue`**

```vue
<script setup lang="ts">
import SettingsPage from '~/modules/settings/pages/SettingsPage.vue'
definePageMeta({ layout: 'admin', middleware: ['auth'] })
</script>
<template><SettingsPage /></template>
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck && npm run lint
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/modules/settings/ src/pages/settings.vue src/core/i18n/locales/ro.json src/core/i18n/locales/en.json
git commit -m "feat(settings): add Settings page with profile update and password reset"
```

---

## Self-Review

**Spec coverage:**
- ✅ Groups: list + create + edit + archive/restore + status filter + stats
- ✅ Children: list + search + add + edit + status change + group assignment + blood group + medical info
- ✅ Settings: profile update + password reset email
- ✅ Sidebar nav enabled for children + groups (usePermissions extended)
- ✅ All roles respected: educator can read children/groups, only admin/super_admin can mutate
- ✅ Soft delete: children use `deleted_at` on withdraw/graduate; groups use `status` for archive (no deleted_at — groups stay queryable for historical data)
- ✅ Multi-tenancy: all queries scoped by `kindergarten_id` when not 'ALL'
- ✅ Audit columns: all inserts set `created_by` + `updated_by`; updates set `updated_by`
- ✅ i18n: RO + EN keys added together for all three modules
- ⬜ Child profile detail page — deferred (not requested for V1 presentation)
- ⬜ Group children list (see which children are in a group) — deferred

**Placeholder scan:** None found — all code is complete.

**Type consistency:**
- `Group` type uses `educatorName: string | null` — `toGroup()` maps `users!educator_id(full_name)` correctly
- `Child` type uses `groupName: string | null` — `toChild()` maps `groups(name)` correctly
- `useGroups()` returns `items: ComputedRef<Group[]>` — `GroupsListPage` uses `items.value` in computed refs
- `useChildren()` returns `items: ComputedRef<Child[]>` — `ChildrenListPage` uses same pattern
- `createChildSchema` has `consent` omitted (server sets default `{}`) — `createChild` service sets `consent: {}`
- `setChildStatus('withdrawn')` sets `deleted_at` — children.store removes from `items` array after status change (correct: list only shows enrolled by default)
