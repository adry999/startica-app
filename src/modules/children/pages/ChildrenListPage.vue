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

const statusOptions = computed<{ label: string; value: ChildStatus }[]>(() => [
  { label: t('children.status.withdrawn'), value: 'withdrawn' },
  { label: t('children.status.graduated'), value: 'graduated' },
  { label: t('children.status.enrolled'), value: 'enrolled' },
])

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
    cell: ({ row }) => h('span', { class: 'text-sm tabular-nums text-slate-500' }, t('children.years', { n: row.original.age })),
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
            <UTextarea v-model="addState.allergies" :rows="2" class="w-full" />
          </UFormField>
          <UFormField :label="t('children.medicalNotes')" name="medicalNotes">
            <UTextarea v-model="addState.medicalNotes" :rows="2" class="w-full" />
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
            <UTextarea v-model="editState.allergies" :rows="2" class="w-full" />
          </UFormField>
          <UFormField :label="t('children.medicalNotes')" name="medicalNotes">
            <UTextarea v-model="editState.medicalNotes" :rows="2" class="w-full" />
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
