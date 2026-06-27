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
        <UIcon name="i-heroicons-user-plus" class="mr-1.5 h-5 w-5" />
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
