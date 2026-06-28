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
            <UInput v-model="createState.ageRange" :placeholder="t('groups.ageRangePlaceholder')" class="w-full" />
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
            <UInput v-model="editState.ageRange" :placeholder="t('groups.ageRangePlaceholder')" class="w-full" />
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
