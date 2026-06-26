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
const { user } = useAuth()
const tenantStore = useTenantStore()
const { items, loading, fetchAll, invite, updateProfile, setStatus, remove } = useStaff()

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const canUpdateStaff = computed(() => can('update', 'staff'))
const canDeleteStaff = computed(() => can('delete', 'staff'))

const selectedKgId = computed(() => tenantStore.selectedKindergartenId)

useLazyAsyncData(
  'staff',
  () => selectedKgId.value !== 'ALL' ? fetchAll(selectedKgId.value) : Promise.resolve(),
  { watch: [selectedKgId] },
)

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
  // super_admin cannot be set via this form (schema allows only admin|educator)
  editState.role = member.role === 'super_admin' ? undefined : member.role
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
        UBadge,
        { color: roleBadgeColor(row.original.role), variant: 'soft' },
        () => t(`staff.role.${row.original.role}`),
      ),
  },
  {
    accessorKey: 'status',
    header: t('staff.table.status'),
    cell: ({ row }) =>
      h(
        UBadge,
        { color: row.original.status === 'active' ? 'success' : 'neutral', variant: 'soft' },
        () => t(`staff.status.${row.original.status}`),
      ),
  },
  {
    id: 'actions',
    header: t('staff.table.actions'),
    cell: ({ row }) =>
      h('div', { class: 'flex gap-2' }, [
        canUpdateStaff.value
          ? h(
              UButton,
              { size: 'xs', color: 'neutral', variant: 'soft', onClick: () => openEdit(row.original) },
              () => t('common.edit'),
            )
          : null,
        canUpdateStaff.value
          ? h(
              UButton,
              { size: 'xs', color: 'neutral', variant: 'soft', onClick: () => openStatusConfirm(row.original) },
              () => row.original.status === 'active' ? t('staff.deactivate') : t('staff.reactivate'),
            )
          : null,
        canDeleteStaff.value
          ? h(
              UButton,
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
          <UFormField :label="t('staff.roleLabel')" name="role">
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
          <UFormField v-if="user?.role === 'super_admin'" :label="t('staff.roleLabel')" name="role">
            <USelect
              v-model="editState.role"
              :items="[
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
