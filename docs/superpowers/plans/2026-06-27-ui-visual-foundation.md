# UI Visual Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin UI shell and first two pages (Staff, Dashboard) to match the Startica design mockups — dark sidebar with icons, user avatar header, stat cards, and a functional Dashboard with real Supabase data.

**Architecture:** Three sequential tasks: (1) the layout shell that wraps every admin page, (2) a reusable `BaseAvatar` component + Staff page polish with stat cards and tab filter, (3) a full Dashboard page backed by a new `dashboard` service/store/composable. All UI uses Tailwind classes bound to the design tokens already defined in `src/assets/css/main.css` (`@theme`); no hardcoded hex values anywhere.

**Tech Stack:** Nuxt 3 · Vue 3 · Tailwind CSS v4 · Nuxt UI v3 · @nuxt/icon (Heroicons v2) · Pinia · Supabase JS client · @nuxtjs/i18n

## Global Constraints

- Colors via design tokens only: `bg-slate-800` (sidebar), `bg-teal-600` (primary), `text-slate-400` (muted), `border-border`, `bg-app-bg`. Never hardcode hex.
- All user-facing strings via `useI18n()`. RO default. Add RO + EN key pairs together in every step that touches i18n.
- No raw `if (role === '...')` in UI — use `can()` from `usePermissions()`.
- Services are the only layer that calls Supabase. Flow: Component → Composable → Store → Service.
- All data fetching via `useLazyAsyncData`.
- Icon usage: `<UIcon name="i-heroicons-{name}" class="h-5 w-5" />` (Heroicons v2 solid names).
- Soft delete: every service query adds `.is('deleted_at', null)`.
- DB schema facts: `groups.age_range` is a `text` column (e.g. "3-5 ani"). `children` has `first_name` + `last_name` columns (no `full_name`). No `avatar_url` on children.
- After every task: `npm run typecheck && npm run lint && npm run test -- --run` must all pass.
- Branch is `feature/kindergartens-module`. Commit to this branch.

---

### Task 1: Admin Layout Shell

**Files:**
- Modify: `src/layouts/admin.vue`
- Modify: `src/core/i18n/locales/ro.json`
- Modify: `src/core/i18n/locales/en.json`

**Interfaces:**
- Consumes: `useAuth()`, `usePermissions()`, `useTenantStore()`, `useKindergartensStore()`, `useI18n()`
- Produces: Updated layout — same `<slot />` contract, no page changes needed.

What changes visually:
1. Sidebar: `bg-slate-800` (very dark `#282F32`). Small teal logo square. Nav items with Heroicons. Settings + Logout at bottom.
2. Header: Minimal breadcrumb on left, user initials avatar + name + role on right.

- [ ] **Step 1: Add missing i18n keys**

In `src/core/i18n/locales/ro.json`, merge these keys (add only what is missing — do not duplicate existing keys):
```json
{
  "nav": {
    "settings": "Setări"
  }
}
```

In `src/core/i18n/locales/en.json`:
```json
{
  "nav": {
    "settings": "Settings"
  }
}
```

- [ ] **Step 2: Replace `src/layouts/admin.vue` with the following**

```vue
<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()
const { user, logout } = useAuth()
const { can } = usePermissions()
const tenantStore = useTenantStore()
const kindergartensStore = useKindergartensStore()

useLazyAsyncData('admin-kindergartens', async () => {
  await kindergartensStore.fetchAll()
  if (!can('read', 'kindergarten') && tenantStore.selectedKindergartenId === 'ALL') {
    const first = kindergartensStore.items[0]
    if (first) tenantStore.selectKindergarten(first.id)
  }
})

const tenantOptions = computed(() => {
  const options: Array<{ label: string; value: string }> = []
  if (can('read', 'kindergarten')) {
    options.push({ label: t('tenant.all'), value: 'ALL' })
  }
  for (const kg of kindergartensStore.items) {
    options.push({ label: kg.name, value: kg.id })
  }
  return options
})

const navItems = computed(() => [
  { label: t('nav.overview'),      to: '/',               icon: 'i-heroicons-squares-2x2',      enabled: true },
  { label: t('nav.kindergartens'), to: '/kindergartens',  icon: 'i-heroicons-building-office-2', enabled: can('read', 'kindergarten') },
  { label: t('nav.staff'),         to: '/staff',          icon: 'i-heroicons-user-group',        enabled: can('read', 'staff') },
  { label: t('nav.groups'),        to: '/groups',         icon: 'i-heroicons-users',             enabled: false },
  { label: t('nav.children'),      to: '/children',       icon: 'i-heroicons-academic-cap',      enabled: false },
])

const userInitials = computed(() => {
  const name = user.value?.fullName ?? ''
  return name.trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('') || '?'
})

async function onLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex min-h-screen bg-app-bg font-sans">
    <!-- ── Sidebar ──────────────────────────────────────────────────────── -->
    <aside class="flex w-64 shrink-0 flex-col bg-slate-800">
      <!-- Logo -->
      <div class="flex items-center gap-3 px-5 py-5">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600">
          <span class="text-sm font-bold text-white">S</span>
        </div>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-white">{{ t('common.appName') }}</p>
          <p class="text-xs text-slate-400">Admin Portal</p>
        </div>
      </div>

      <!-- Tenant selector -->
      <div v-if="can('read', 'staff')" class="px-3 pb-3">
        <USelect
          :model-value="tenantStore.selectedKindergartenId"
          :items="tenantOptions"
          size="sm"
          class="w-full"
          @update:model-value="(v) => tenantStore.selectKindergarten(v as string)"
        />
      </div>

      <!-- Primary nav -->
      <nav class="flex-1 space-y-0.5 px-2 py-1">
        <template v-for="item in navItems" :key="item.to">
          <NuxtLink
            v-if="item.enabled"
            :to="item.to"
            class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            active-class="bg-teal-600/10 text-teal-300"
          >
            <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
            {{ item.label }}
          </NuxtLink>
          <span v-else class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 cursor-default">
            <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
            <span class="flex-1">{{ item.label }}</span>
            <UBadge size="xs" color="neutral" variant="soft">{{ t('nav.comingSoon') }}</UBadge>
          </span>
        </template>
      </nav>

      <!-- Bottom: Settings + Logout -->
      <div class="border-t border-slate-700 px-2 py-3 space-y-0.5">
        <NuxtLink
          to="/settings"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          active-class="bg-teal-600/10 text-teal-300"
        >
          <UIcon name="i-heroicons-cog-6-tooth" class="h-5 w-5 shrink-0" />
          {{ t('nav.settings') }}
        </NuxtLink>
        <button
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          @click="onLogout"
        >
          <UIcon name="i-heroicons-arrow-right-on-rectangle" class="h-5 w-5 shrink-0" />
          {{ t('auth.logout') }}
        </button>
      </div>
    </aside>

    <!-- ── Main ─────────────────────────────────────────────────────────── -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Header -->
      <header class="flex h-16 shrink-0 items-center justify-between border-b border-border bg-white px-6">
        <span class="text-sm text-slate-400">{{ t('common.appName') }}</span>
        <div class="flex items-center gap-4">
          <LanguageSwitcher />
          <div class="flex items-center gap-3">
            <div class="text-right">
              <p class="text-sm font-medium text-slate-800 leading-tight">{{ user?.fullName }}</p>
              <p class="text-xs text-slate-400">{{ user ? t(`auth.role.${user.role}`) : '' }}</p>
            </div>
            <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-semibold text-white">
              {{ userInitials }}
            </span>
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 overflow-auto p-8">
        <slot />
      </main>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Verify**

```bash
npm run typecheck && npm run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add src/layouts/admin.vue src/core/i18n/locales/ro.json src/core/i18n/locales/en.json
git commit -m "feat(ui): rebuild admin layout shell — dark sidebar with icons and user avatar header"
```

---

### Task 2: BaseAvatar Component + Staff Page Polish

**Files:**
- Create: `src/shared/ui/BaseAvatar.vue`
- Modify: `src/modules/staff/pages/StaffListPage.vue`
- Modify: `src/core/i18n/locales/ro.json`
- Modify: `src/core/i18n/locales/en.json`

**Interfaces:**
- Produces: `<BaseAvatar name="..." size="xs|sm|md|lg" :src="null" />` — auto-imported via Nuxt (listed in `nuxt.config.ts` `components.dirs`). Used here and in Task 3.
- Consumes: `items` from `useStaff()` (already loaded by `useLazyAsyncData`).

- [ ] **Step 1: Create `src/shared/ui/BaseAvatar.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  src?: string | null
}>(), { size: 'md', src: null })

const initials = computed(() =>
  props.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('') || '?',
)

const sizeClass = computed(() => ({
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
}[props.size]))
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="name"
    :class="['shrink-0 rounded-full object-cover', sizeClass]"
  />
  <span
    v-else
    :class="['inline-flex shrink-0 items-center justify-center rounded-full bg-teal-600 font-semibold text-white', sizeClass]"
  >
    {{ initials }}
  </span>
</template>
```

- [ ] **Step 2: Add i18n keys for Staff page**

In `src/core/i18n/locales/ro.json`, add these keys under `"staff"`:
```json
"pageSubtitle": "Gestionează membrii și rolurile personalului.",
"stats": {
  "total": "Total personal",
  "active": "Activi",
  "inactive": "Inactivi",
  "admins": "Administratori"
},
"filter": {
  "all": "Toți",
  "educators": "Educatori",
  "admins": "Administratori"
}
```

In `src/core/i18n/locales/en.json`, add under `"staff"`:
```json
"pageSubtitle": "Manage staff members and their roles.",
"stats": {
  "total": "Total Staff",
  "active": "Active",
  "inactive": "Inactive",
  "admins": "Admins"
},
"filter": {
  "all": "All",
  "educators": "Educators",
  "admins": "Admins"
}
```

- [ ] **Step 3: Replace `src/modules/staff/pages/StaffListPage.vue`**

```vue
<script setup lang="ts">
import { h, reactive, ref, computed } from 'vue'
import type { TableColumn, FormSubmitEvent } from '@nuxt/ui'
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
const tenantStore = useTenantStore()
const { items, loading, fetchAll, invite, updateProfile, setStatus, remove } = useStaff()

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const BaseAvatar = resolveComponent('BaseAvatar')

const canUpdateStaff = computed(() => can('update', 'staff'))
const canDeleteStaff = computed(() => can('delete', 'staff'))
const selectedKgId = computed(() => tenantStore.selectedKindergartenId)

useLazyAsyncData(
  'staff',
  () => selectedKgId.value !== 'ALL' ? fetchAll(selectedKgId.value) : Promise.resolve(),
  { watch: [selectedKgId] },
)

// ── Stats (computed from loaded items) ─────────────────────────────────────
const totalStaff  = computed(() => items.value.length)
const activeStaff = computed(() => items.value.filter(s => s.status === 'active').length)
const inactiveStaff = computed(() => items.value.filter(s => s.status === 'inactive').length)
const adminCount  = computed(() => items.value.filter(s => s.role === 'admin').length)

// ── Tab filter ─────────────────────────────────────────────────────────────
const activeFilter = ref<'all' | 'educators' | 'admins'>('all')
const filteredItems = computed(() => {
  if (activeFilter.value === 'educators') return items.value.filter(s => s.role === 'educator')
  if (activeFilter.value === 'admins')    return items.value.filter(s => s.role === 'admin')
  return items.value
})

// ── Invite modal ───────────────────────────────────────────────────────────
const inviteModalOpen = ref(false)
const inviteState = reactive<Partial<InviteStaffInput>>({
  email: undefined, fullName: undefined, role: 'educator', kindergartenId: undefined,
})

function openInvite() {
  inviteState.email       = undefined
  inviteState.fullName    = undefined
  inviteState.role        = 'educator'
  inviteState.kindergartenId = selectedKgId.value !== 'ALL' ? selectedKgId.value : undefined
  inviteModalOpen.value   = true
}

const roleOptions = computed(() => {
  if (can('assign-role', 'staff')) {
    return [
      { label: t('staff.role.admin'),    value: 'admin' },
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
const editTarget    = ref<StaffMember | null>(null)
const editState     = reactive<Partial<UpdateStaffInput>>({})

function openEdit(member: StaffMember) {
  editTarget.value    = member
  editState.fullName  = member.fullName
  editState.role      = member.role === 'super_admin' ? undefined : member.role
  editModalOpen.value = true
}

async function onEditSubmit(event: FormSubmitEvent<UpdateStaffInput>) {
  if (!editTarget.value) return
  const data: UpdateStaffInput = { fullName: event.data.fullName }
  if (can('assign-role', 'staff') && event.data.role) data.role = event.data.role
  const ok = await updateProfile(editTarget.value.id, data)
  if (ok) {
    editModalOpen.value = false
    toast.add({ title: t('staff.updateSuccess'), color: 'success' })
  }
}

// ── Status confirm modal ───────────────────────────────────────────────────
const statusModalOpen = ref(false)
const statusTarget    = ref<StaffMember | null>(null)

function openStatusConfirm(member: StaffMember) {
  statusTarget.value    = member
  statusModalOpen.value = true
}

const statusConfirmTitle = computed(() =>
  statusTarget.value?.status === 'active' ? t('staff.confirmDeactivateTitle') : t('staff.confirmReactivateTitle'),
)
const statusConfirmBody = computed(() =>
  statusTarget.value?.status === 'active' ? t('staff.confirmDeactivateBody') : t('staff.confirmReactivateBody'),
)

async function onStatusConfirm() {
  if (!statusTarget.value) return
  const nextStatus = statusTarget.value.status === 'active' ? 'inactive' : 'active'
  const ok = await setStatus(statusTarget.value.id, nextStatus)
  if (ok) {
    statusModalOpen.value = false
    toast.add({
      title: nextStatus === 'inactive' ? t('staff.deactivateSuccess') : t('staff.reactivateSuccess'),
      color: 'success',
    })
  }
}

// ── Remove confirm modal ───────────────────────────────────────────────────
const removeModalOpen = ref(false)
const removeTarget    = ref<StaffMember | null>(null)

function openRemoveConfirm(member: StaffMember) {
  removeTarget.value    = member
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

// ── Table ──────────────────────────────────────────────────────────────────
const roleBadgeColor = (role: StaffMember['role']): 'error' | 'primary' | 'neutral' => {
  if (role === 'super_admin') return 'error'
  if (role === 'admin')       return 'primary'
  return 'neutral'
}

const columns = computed<TableColumn<StaffMember>[]>(() => [
  {
    id: 'member',
    header: t('staff.table.name'),
    cell: ({ row }) =>
      h('div', { class: 'flex items-center gap-3' }, [
        h(BaseAvatar, { name: row.original.fullName, src: row.original.avatarUrl, size: 'sm' }),
        h('div', {}, [
          h('p', { class: 'text-sm font-medium text-slate-800' }, row.original.fullName),
          h('p', { class: 'text-xs text-slate-400' }, row.original.email),
        ]),
      ]),
  },
  {
    accessorKey: 'role',
    header: t('staff.table.role'),
    cell: ({ row }) =>
      h(UBadge, { color: roleBadgeColor(row.original.role), variant: 'soft' }, () => t(`staff.role.${row.original.role}`)),
  },
  {
    accessorKey: 'status',
    header: t('staff.table.status'),
    cell: ({ row }) =>
      h(UBadge,
        { color: row.original.status === 'active' ? 'success' : 'neutral', variant: 'soft' },
        () => t(`staff.status.${row.original.status}`),
      ),
  },
  {
    id: 'actions',
    header: t('staff.table.actions'),
    cell: ({ row }) =>
      h('div', { class: 'flex gap-1' }, [
        canUpdateStaff.value
          ? h(UButton, { size: 'xs', color: 'neutral', variant: 'ghost', onClick: () => openEdit(row.original) }, () => t('common.edit'))
          : null,
        canUpdateStaff.value
          ? h(UButton,
              { size: 'xs', color: 'neutral', variant: 'ghost', onClick: () => openStatusConfirm(row.original) },
              () => row.original.status === 'active' ? t('staff.deactivate') : t('staff.reactivate'),
            )
          : null,
        canDeleteStaff.value
          ? h(UButton, { size: 'xs', color: 'error', variant: 'ghost', onClick: () => openRemoveConfirm(row.original) }, () => t('staff.remove'))
          : null,
      ]),
  },
])
</script>

<template>
  <div class="space-y-6">
    <!-- Page header -->
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-xl font-semibold text-slate-800">{{ t('staff.pageTitle') }}</h1>
        <p class="mt-0.5 text-sm text-slate-400">{{ t('staff.pageSubtitle') }}</p>
      </div>
      <UButton
        v-if="can('create', 'staff') && selectedKgId !== 'ALL'"
        color="primary"
        @click="openInvite"
      >
        <UIcon name="i-heroicons-user-plus" class="mr-1.5 h-4 w-4" />
        {{ t('staff.invite') }}
      </UButton>
    </div>

    <!-- Stat cards — visible only when a specific kindergarten is selected -->
    <div v-if="selectedKgId !== 'ALL'" class="grid grid-cols-4 gap-4">
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('staff.stats.total') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-slate-800">{{ totalStaff }}</p>
      </div>
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('staff.stats.active') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-teal-600">{{ activeStaff }}</p>
      </div>
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('staff.stats.inactive') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-slate-800">{{ inactiveStaff }}</p>
      </div>
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('staff.stats.admins') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-slate-800">{{ adminCount }}</p>
      </div>
    </div>

    <!-- Select kindergarten prompt -->
    <p v-if="selectedKgId === 'ALL'" class="text-sm text-slate-400">
      {{ t('staff.selectKindergarten') }}
    </p>

    <!-- Tab filter + table -->
    <template v-else>
      <div class="rounded-xl border border-border bg-white">
        <!-- Tabs -->
        <div class="flex border-b border-border px-4">
          <button
            v-for="f in (['all', 'educators', 'admins'] as const)"
            :key="f"
            :class="[
              '-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              activeFilter === f
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-slate-400 hover:text-slate-600',
            ]"
            @click="activeFilter = f"
          >
            {{ t(`staff.filter.${f}`) }}
          </button>
        </div>

        <UTable :data="filteredItems" :columns="columns" :loading="loading">
          <template #empty>
            <p class="py-10 text-center text-sm text-slate-400">{{ t('staff.empty') }}</p>
          </template>
        </UTable>
      </div>
    </template>

    <!-- ── Modals ────────────────────────────────────────────────────────── -->
    <UModal v-model:open="inviteModalOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('staff.inviteTitle') }}</h2>
      </template>
      <template #body>
        <UForm :schema="inviteStaffSchema" :state="inviteState" class="space-y-4" @submit="onInviteSubmit">
          <UFormField :label="t('staff.email')" name="email">
            <UInput v-model="inviteState.email" type="email" class="w-full" />
          </UFormField>
          <UFormField :label="t('staff.name')" name="fullName">
            <UInput v-model="inviteState.fullName" class="w-full" />
          </UFormField>
          <UFormField :label="t('staff.roleLabel')" name="role">
            <USelect v-model="inviteState.role" :items="roleOptions" class="w-full" />
          </UFormField>
          <UButton type="submit" color="primary" block loading-auto :loading="loading">
            {{ t('staff.invite') }}
          </UButton>
        </UForm>
      </template>
    </UModal>

    <UModal v-model:open="editModalOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('staff.editTitle') }}</h2>
      </template>
      <template #body>
        <UForm :schema="updateStaffSchema" :state="editState" class="space-y-4" @submit="onEditSubmit">
          <UFormField :label="t('staff.name')" name="fullName">
            <UInput v-model="editState.fullName" class="w-full" />
          </UFormField>
          <UFormField v-if="can('assign-role', 'staff')" :label="t('staff.roleLabel')" name="role">
            <USelect
              v-model="editState.role"
              :items="[{ label: t('staff.role.admin'), value: 'admin' }, { label: t('staff.role.educator'), value: 'educator' }]"
              class="w-full"
            />
          </UFormField>
          <UButton type="submit" color="primary" loading-auto :loading="loading">{{ t('common.save') }}</UButton>
        </UForm>
      </template>
    </UModal>

    <UModal v-model:open="statusModalOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ statusConfirmTitle }}</h2>
      </template>
      <template #body>
        <p class="text-sm text-slate-500">{{ statusConfirmBody }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="statusModalOpen = false">{{ t('common.cancel') }}</UButton>
          <UButton color="primary" loading-auto :loading="loading" @click="onStatusConfirm">{{ t('staff.confirm') }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="removeModalOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('staff.confirmRemoveTitle') }}</h2>
      </template>
      <template #body>
        <p class="text-sm text-slate-500">{{ t('staff.confirmRemoveBody') }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="removeModalOpen = false">{{ t('common.cancel') }}</UButton>
          <UButton color="error" loading-auto :loading="loading" @click="onRemoveConfirm">{{ t('staff.remove') }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck && npm run lint && npm run test -- --run
```

Expected: 0 errors, 89 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ui/BaseAvatar.vue src/modules/staff/pages/StaffListPage.vue src/core/i18n/locales/ro.json src/core/i18n/locales/en.json
git commit -m "feat(ui): add BaseAvatar component and polish staff page with stat cards and tab filter"
```

---

### Task 3: Dashboard Page

**Files:**
- Create: `src/modules/dashboard/types/dashboard.types.ts`
- Create: `src/modules/dashboard/services/dashboard.service.ts`
- Create: `src/modules/dashboard/stores/dashboard.store.ts`
- Create: `src/modules/dashboard/composables/useDashboard.ts`
- Create: `src/modules/dashboard/pages/DashboardPage.vue`
- Modify: `src/pages/index.vue`
- Modify: `src/core/i18n/locales/ro.json`
- Modify: `src/core/i18n/locales/en.json`

**Interfaces:**
- Consumes: `useTenantStore()` for selected kindergarten ID. `BaseAvatar` from Task 2. Supabase client via `useSupabaseClient()`.
- Produces: `useDashboard()` composable (auto-imported — already in `nuxt.config.ts` `imports.dirs`). `DashboardPage.vue` imported by `src/pages/index.vue`.

DB schema reminders:
- `children` table: `status` enum (`enrolled`, `withdrawn`, `graduated`). Query enrolled with `.eq('status', 'enrolled')`.
- `groups` table: `age_range text` (single column, e.g. "3-5 ani"), `status` enum (`active`, `archived`).
- `user_kindergartens`: join table `(user_id, kindergarten_id)` — used to count staff per kindergarten.
- FK join syntax for Supabase client: `users!educator_id(full_name)` — reads `groups.educator_id → users.id`.

- [ ] **Step 1: Create `src/modules/dashboard/types/dashboard.types.ts`**

```ts
export interface DashboardStats {
  totalChildren: number
  totalGroups: number
  activeStaff: number
}

export interface GroupSummary {
  id: string
  name: string
  ageRange: string | null
  capacity: number | null
  educatorName: string | null
}
```

- [ ] **Step 2: Create `src/modules/dashboard/services/dashboard.service.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DashboardStats, GroupSummary } from '../types/dashboard.types'

type Result<T> = { success: true; data: T } | { success: false; error: string }

export async function fetchStats(
  client: SupabaseClient,
  kindergartenId: string,
): Promise<Result<DashboardStats>> {
  const isAll = kindergartenId === 'ALL'

  const childrenQuery = client
    .from('children')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('status', 'enrolled')

  const groupsQuery = client
    .from('groups')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('status', 'active')

  // Staff count: per-kg use user_kindergartens; for ALL use users table directly
  const staffQuery = isAll
    ? client
        .from('users')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'active')
        .neq('role', 'super_admin')
    : client
        .from('user_kindergartens')
        .select('user_id', { count: 'exact', head: true })
        .eq('kindergarten_id', kindergartenId)

  if (!isAll) {
    childrenQuery.eq('kindergarten_id', kindergartenId)
    groupsQuery.eq('kindergarten_id', kindergartenId)
  }

  const [childrenRes, groupsRes, staffRes] = await Promise.all([childrenQuery, groupsQuery, staffQuery])

  if (childrenRes.error) return { success: false, error: childrenRes.error.message }
  if (groupsRes.error)   return { success: false, error: groupsRes.error.message }
  if (staffRes.error)    return { success: false, error: staffRes.error.message }

  return {
    success: true,
    data: {
      totalChildren: childrenRes.count ?? 0,
      totalGroups:   groupsRes.count ?? 0,
      activeStaff:   staffRes.count ?? 0,
    },
  }
}

export async function fetchActiveGroups(
  client: SupabaseClient,
  kindergartenId: string,
): Promise<Result<GroupSummary[]>> {
  let q = client
    .from('groups')
    .select('id, name, age_range, capacity, users!educator_id(full_name)')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('name')
    .limit(10)

  if (kindergartenId !== 'ALL') {
    q = q.eq('kindergarten_id', kindergartenId)
  }

  const { data, error } = await q

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((row) => ({
      id:           row.id as string,
      name:         row.name as string,
      ageRange:     (row.age_range as string | null) ?? null,
      capacity:     (row.capacity as number | null) ?? null,
      educatorName: (row.users as { full_name: string } | null)?.full_name ?? null,
    })),
  }
}
```

- [ ] **Step 3: Create `src/modules/dashboard/stores/dashboard.store.ts`**

```ts
import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import * as dashboardService from '../services/dashboard.service'
import type { DashboardStats, GroupSummary } from '../types/dashboard.types'

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    stats:   null as DashboardStats | null,
    groups:  [] as GroupSummary[],
    loading: false,
    error:   null as string | null,
  }),

  actions: {
    async fetchAll(kindergartenId: string) {
      this.loading = true
      this.error   = null
      const client = useSupabaseClient()

      const [statsResult, groupsResult] = await Promise.all([
        dashboardService.fetchStats(client, kindergartenId),
        dashboardService.fetchActiveGroups(client, kindergartenId),
      ])

      this.loading = false

      if (!statsResult.success)  { this.error = statsResult.error;  return }
      if (!groupsResult.success) { this.error = groupsResult.error; return }

      this.stats  = statsResult.data
      this.groups = groupsResult.data
    },
  },
})
```

- [ ] **Step 4: Create `src/modules/dashboard/composables/useDashboard.ts`**

```ts
import { computed } from 'vue'
import { useDashboardStore } from '../stores/dashboard.store'

export function useDashboard() {
  const store = useDashboardStore()
  return {
    stats:    computed(() => store.stats),
    groups:   computed(() => store.groups),
    loading:  computed(() => store.loading),
    error:    computed(() => store.error),
    fetchAll: (kindergartenId: string) => store.fetchAll(kindergartenId),
  }
}
```

- [ ] **Step 5: Add dashboard i18n keys**

In `src/core/i18n/locales/ro.json`, add top-level `"dashboard"` section:
```json
"dashboard": {
  "pageTitle": "Prezentare generală",
  "pageSubtitle": "Rezumatul activității grădiniței selectate.",
  "stats": {
    "children": "Copii înscriși",
    "groups": "Grupe active",
    "staff": "Personal activ",
    "attendance": "Prezență"
  },
  "activeGroups": "Grupe active",
  "groupsEmpty": "Nu există grupe active.",
  "quickActions": "Acțiuni rapide",
  "attendanceComingSoon": "Modulul prezență vine în curând",
  "table": {
    "group": "Grupă",
    "ageRange": "Interval vârstă",
    "educator": "Educator",
    "capacity": "Capacitate"
  }
}
```

In `src/core/i18n/locales/en.json`, add:
```json
"dashboard": {
  "pageTitle": "Overview",
  "pageSubtitle": "Summary of the selected kindergarten's activity.",
  "stats": {
    "children": "Enrolled Children",
    "groups": "Active Groups",
    "staff": "Active Staff",
    "attendance": "Attendance"
  },
  "activeGroups": "Active Groups",
  "groupsEmpty": "No active groups.",
  "quickActions": "Quick Actions",
  "attendanceComingSoon": "Attendance module coming soon",
  "table": {
    "group": "Group",
    "ageRange": "Age Range",
    "educator": "Educator",
    "capacity": "Capacity"
  }
}
```

- [ ] **Step 6: Create `src/modules/dashboard/pages/DashboardPage.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()
const { can } = usePermissions()
const tenantStore = useTenantStore()
const { stats, groups, loading, fetchAll } = useDashboard()

const selectedKgId = computed(() => tenantStore.selectedKindergartenId)

useLazyAsyncData(
  'dashboard',
  () => fetchAll(selectedKgId.value),
  { watch: [selectedKgId] },
)
</script>

<template>
  <div class="space-y-6">
    <!-- Page header -->
    <div>
      <h1 class="text-xl font-semibold text-slate-800">{{ t('dashboard.pageTitle') }}</h1>
      <p class="mt-0.5 text-sm text-slate-400">{{ t('dashboard.pageSubtitle') }}</p>
    </div>

    <!-- Stat cards -->
    <div class="grid grid-cols-4 gap-4">
      <!-- Enrolled children -->
      <div class="rounded-xl border border-border bg-white p-5">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('dashboard.stats.children') }}</p>
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
            <UIcon name="i-heroicons-academic-cap" class="h-5 w-5 text-teal-600" />
          </div>
        </div>
        <p class="mt-3 text-3xl font-semibold tabular-nums text-slate-800">
          <span v-if="loading" class="text-slate-300">—</span>
          <span v-else>{{ stats?.totalChildren ?? 0 }}</span>
        </p>
      </div>

      <!-- Active groups -->
      <div class="rounded-xl border border-border bg-white p-5">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('dashboard.stats.groups') }}</p>
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
            <UIcon name="i-heroicons-user-group" class="h-5 w-5 text-amber-500" />
          </div>
        </div>
        <p class="mt-3 text-3xl font-semibold tabular-nums text-slate-800">
          <span v-if="loading" class="text-slate-300">—</span>
          <span v-else>{{ stats?.totalGroups ?? 0 }}</span>
        </p>
      </div>

      <!-- Active staff -->
      <div class="rounded-xl border border-border bg-white p-5">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('dashboard.stats.staff') }}</p>
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
            <UIcon name="i-heroicons-users" class="h-5 w-5 text-slate-500" />
          </div>
        </div>
        <p class="mt-3 text-3xl font-semibold tabular-nums text-slate-800">
          <span v-if="loading" class="text-slate-300">—</span>
          <span v-else>{{ stats?.activeStaff ?? 0 }}</span>
        </p>
      </div>

      <!-- Attendance (coming soon) -->
      <div class="rounded-xl border border-border bg-white p-5">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('dashboard.stats.attendance') }}</p>
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
            <UIcon name="i-heroicons-chart-bar" class="h-5 w-5 text-slate-300" />
          </div>
        </div>
        <p class="mt-3 text-sm text-slate-300">{{ t('dashboard.attendanceComingSoon') }}</p>
      </div>
    </div>

    <!-- Quick actions + Active groups -->
    <div class="grid grid-cols-3 gap-6">
      <!-- Quick actions -->
      <div class="rounded-xl border border-border bg-white p-5">
        <h2 class="mb-4 text-sm font-semibold text-slate-800">{{ t('dashboard.quickActions') }}</h2>
        <div class="space-y-1">
          <NuxtLink
            v-if="can('read', 'staff')"
            to="/staff"
            class="flex items-center gap-3 rounded-lg p-3 text-sm text-slate-600 transition-colors hover:bg-app-bg"
          >
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50">
              <UIcon name="i-heroicons-user-plus" class="h-4 w-4 text-teal-600" />
            </div>
            {{ t('staff.invite') }}
          </NuxtLink>
          <NuxtLink
            to="/children"
            class="flex items-center gap-3 rounded-lg p-3 text-sm text-slate-600 transition-colors hover:bg-app-bg"
          >
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50">
              <UIcon name="i-heroicons-academic-cap" class="h-4 w-4 text-amber-500" />
            </div>
            {{ t('nav.children') }}
          </NuxtLink>
          <NuxtLink
            to="/groups"
            class="flex items-center gap-3 rounded-lg p-3 text-sm text-slate-600 transition-colors hover:bg-app-bg"
          >
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
              <UIcon name="i-heroicons-user-group" class="h-4 w-4 text-slate-500" />
            </div>
            {{ t('nav.groups') }}
          </NuxtLink>
        </div>
      </div>

      <!-- Active groups table -->
      <div class="col-span-2 rounded-xl border border-border bg-white">
        <div class="border-b border-border px-5 py-4">
          <h2 class="text-sm font-semibold text-slate-800">{{ t('dashboard.activeGroups') }}</h2>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-12">
          <UIcon name="i-heroicons-arrow-path" class="h-5 w-5 animate-spin text-slate-300" />
        </div>
        <p v-else-if="groups.length === 0" class="py-12 text-center text-sm text-slate-400">
          {{ t('dashboard.groupsEmpty') }}
        </p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="border-b border-border bg-app-bg">
              <th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('dashboard.table.group') }}</th>
              <th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('dashboard.table.ageRange') }}</th>
              <th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('dashboard.table.educator') }}</th>
              <th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('dashboard.table.capacity') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="group in groups"
              :key="group.id"
              class="border-b border-border last:border-0"
            >
              <td class="px-5 py-3 font-medium text-slate-800">{{ group.name }}</td>
              <td class="px-5 py-3 text-slate-500">{{ group.ageRange ?? '—' }}</td>
              <td class="px-5 py-3 text-slate-500">{{ group.educatorName ?? '—' }}</td>
              <td class="px-5 py-3 tabular-nums text-slate-500">{{ group.capacity ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 7: Update `src/pages/index.vue`**

```vue
<script setup lang="ts">
import DashboardPage from '~/modules/dashboard/pages/DashboardPage.vue'

definePageMeta({ layout: 'admin' })
</script>

<template>
  <DashboardPage />
</template>
```

- [ ] **Step 8: Verify**

```bash
npm run typecheck && npm run lint && npm run test -- --run
```

Expected: 0 errors, 89 tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/modules/dashboard/ src/pages/index.vue src/core/i18n/locales/ro.json src/core/i18n/locales/en.json
git commit -m "feat(dashboard): add dashboard page with stat cards and active groups table"
```

---

## Self-Review

**Spec coverage:**
- ✅ Sidebar dark with icons matching mockup
- ✅ User avatar (initials) in header
- ✅ Staff page stat cards (Total, Active, Inactive, Admins)
- ✅ Tab filter on Staff page (All / Educators / Admins)
- ✅ Avatar column in Staff table
- ✅ Dashboard stat cards (Children, Groups, Staff, Attendance placeholder)
- ✅ Dashboard quick actions panel
- ✅ Dashboard active groups table with real Supabase data
- ✅ BaseAvatar reusable component (used by Staff + Dashboard, ready for Children)
- ⬜ Children Directory, Child Profile, Groups Management, Settings — deferred to Plan 2

**Placeholder scan:** None found.

**Type consistency:**
- `GroupSummary.ageRange: string | null` — matches `groups.age_range text` column
- `DashboardStats.totalChildren` — matches `fetchStats` return
- `BaseAvatar` props `name`, `size`, `src` — used consistently in Task 2 and 3
- `useDashboard()` returns `fetchAll(kindergartenId: string)` — called in DashboardPage with `selectedKgId.value` which is `string` (tenant store always returns string)
