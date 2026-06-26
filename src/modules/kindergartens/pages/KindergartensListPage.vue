<script setup lang="ts">
import { h, reactive, ref, computed, onMounted } from 'vue'
import type { TableColumn, FormSubmitEvent } from '@nuxt/ui'
import {
  kindergartenDetailsSchema,
  kindergartenSettingsSchema,
  type KindergartenDetailsInput,
  type KindergartenSettingsInput,
} from '~/shared/schemas/kindergarten.schema'
import type { Kindergarten } from '../types/kindergarten.types'

const { t } = useI18n()
const toast = useToast()
const { can } = usePermissions()
const { items, loading, fetchAll, create, updateDetails, updateSettings, setStatus } = useKindergartens()

onMounted(() => {
  fetchAll()
})

const createModalOpen = ref(false)
const createState = reactive<Partial<KindergartenDetailsInput>>({ name: undefined, address: undefined, city: undefined, phone: undefined })

async function onCreateSubmit(event: FormSubmitEvent<KindergartenDetailsInput>) {
  const ok = await create(event.data)
  if (ok) {
    createModalOpen.value = false
    toast.add({ title: t('kindergartens.createSuccess'), color: 'success' })
  }
}

const editModalOpen = ref(false)
const editTarget = ref<Kindergarten | null>(null)
const editDetailsState = reactive<Partial<KindergartenDetailsInput>>({})
const editSettingsState = reactive<Partial<KindergartenSettingsInput>>({})

function openEdit(kindergarten: Kindergarten) {
  editTarget.value = kindergarten
  editDetailsState.name = kindergarten.name
  editDetailsState.address = kindergarten.address ?? undefined
  editDetailsState.city = kindergarten.city ?? undefined
  editDetailsState.phone = kindergarten.phone ?? undefined
  editSettingsState.timezone = kindergarten.settings.timezone
  editSettingsState.defaultLocale = kindergarten.settings.defaultLocale
  editSettingsState.workingHoursStart = kindergarten.settings.workingHours.start
  editSettingsState.workingHoursEnd = kindergarten.settings.workingHours.end
  editModalOpen.value = true
}

async function onEditDetailsSubmit(event: FormSubmitEvent<KindergartenDetailsInput>) {
  if (!editTarget.value) return
  const ok = await updateDetails(editTarget.value.id, event.data)
  if (ok) {
    editModalOpen.value = false
    toast.add({ title: t('kindergartens.updateSuccess'), color: 'success' })
  }
}

async function onEditSettingsSubmit(event: FormSubmitEvent<KindergartenSettingsInput>) {
  if (!editTarget.value) return
  const ok = await updateSettings(editTarget.value.id, event.data)
  if (ok) toast.add({ title: t('kindergartens.updateSuccess'), color: 'success' })
}

const confirmModalOpen = ref(false)
const confirmTarget = ref<Kindergarten | null>(null)

function openConfirm(kindergarten: Kindergarten) {
  confirmTarget.value = kindergarten
  confirmModalOpen.value = true
}

async function onConfirmStatusChange() {
  if (!confirmTarget.value) return
  const nextStatus = confirmTarget.value.status === 'active' ? 'suspended' : 'active'
  const ok = await setStatus(confirmTarget.value.id, nextStatus)
  if (ok) {
    confirmModalOpen.value = false
    toast.add({ title: t('kindergartens.updateSuccess'), color: 'success' })
  }
}

// computed, not a plain const — header strings must re-evaluate when the
// active locale changes (LanguageSwitcher), otherwise headers freeze at
// whatever language was active on first render.
const columns = computed<TableColumn<Kindergarten>[]>(() => [
  { accessorKey: 'name', header: t('kindergartens.table.name') },
  { accessorKey: 'city', header: t('kindergartens.table.city') },
  {
    accessorKey: 'status',
    header: t('kindergartens.table.status'),
    cell: ({ row }) =>
      h(
        resolveComponent('UBadge'),
        { color: row.original.status === 'active' ? 'success' : 'neutral', variant: 'soft' },
        () => t(`kindergartens.status.${row.original.status}`),
      ),
  },
  {
    accessorKey: 'createdAt',
    header: t('kindergartens.table.createdAt'),
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString('ro-RO'),
  },
  {
    id: 'actions',
    header: t('kindergartens.table.actions'),
    cell: ({ row }) =>
      h('div', { class: 'flex gap-2' }, [
        can('update', 'kindergarten')
          ? h(
              resolveComponent('UButton'),
              { size: 'xs', color: 'neutral', variant: 'soft', onClick: () => openEdit(row.original) },
              () => t('common.edit'),
            )
          : null,
        can('update', 'kindergarten')
          ? h(
              resolveComponent('UButton'),
              { size: 'xs', color: 'neutral', variant: 'soft', onClick: () => openConfirm(row.original) },
              () => t(row.original.status === 'active' ? 'kindergartens.suspend' : 'kindergartens.reactivate'),
            )
          : null,
      ]),
  },
])

const confirmTitle = computed(() =>
  confirmTarget.value?.status === 'active' ? t('kindergartens.confirmSuspendTitle') : t('kindergartens.confirmReactivateTitle'),
)
const confirmBody = computed(() =>
  confirmTarget.value?.status === 'active' ? t('kindergartens.confirmSuspendBody') : t('kindergartens.confirmReactivateBody'),
)
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-xl font-semibold text-neutral-800">{{ t('kindergartens.pageTitle') }}</h1>
      <UModal v-if="can('create', 'kindergarten')" v-model:open="createModalOpen">
        <UButton color="primary">{{ t('kindergartens.new') }}</UButton>

        <template #header>
          <h2 class="text-lg font-semibold">{{ t('kindergartens.createTitle') }}</h2>
        </template>

        <template #body>
          <UForm :schema="kindergartenDetailsSchema" :state="createState" class="space-y-4" @submit="onCreateSubmit">
            <UFormField :label="t('kindergartens.name')" name="name">
              <UInput v-model="createState.name" class="w-full" />
            </UFormField>
            <UFormField :label="t('kindergartens.address')" name="address">
              <UInput v-model="createState.address" class="w-full" />
            </UFormField>
            <UFormField :label="t('kindergartens.city')" name="city">
              <UInput v-model="createState.city" class="w-full" />
            </UFormField>
            <UFormField :label="t('kindergartens.phone')" name="phone">
              <UInput v-model="createState.phone" class="w-full" />
            </UFormField>
            <UButton type="submit" color="primary" block loading-auto :loading="loading">
              {{ t('common.save') }}
            </UButton>
          </UForm>
        </template>
      </UModal>
    </div>

    <UTable :data="items" :columns="columns" :loading="loading">
      <template #empty>
        <p class="py-8 text-center text-sm text-neutral-500">{{ t('kindergartens.empty') }}</p>
      </template>
    </UTable>

    <UModal v-model:open="editModalOpen">
      <template #header>
        <h2 class="text-lg font-semibold">{{ t('kindergartens.editTitle') }}</h2>
      </template>

      <template #body>
        <div class="space-y-6">
          <section>
            <h3 class="mb-3 text-sm font-semibold text-neutral-600">{{ t('kindergartens.detailsSection') }}</h3>
            <UForm :schema="kindergartenDetailsSchema" :state="editDetailsState" class="space-y-4" @submit="onEditDetailsSubmit">
              <UFormField :label="t('kindergartens.name')" name="name">
                <UInput v-model="editDetailsState.name" class="w-full" />
              </UFormField>
              <UFormField :label="t('kindergartens.address')" name="address">
                <UInput v-model="editDetailsState.address" class="w-full" />
              </UFormField>
              <UFormField :label="t('kindergartens.city')" name="city">
                <UInput v-model="editDetailsState.city" class="w-full" />
              </UFormField>
              <UFormField :label="t('kindergartens.phone')" name="phone">
                <UInput v-model="editDetailsState.phone" class="w-full" />
              </UFormField>
              <UButton type="submit" color="primary" loading-auto :loading="loading">{{ t('common.save') }}</UButton>
            </UForm>
          </section>

          <section>
            <h3 class="mb-3 text-sm font-semibold text-neutral-600">{{ t('kindergartens.settingsSection') }}</h3>
            <UForm :schema="kindergartenSettingsSchema" :state="editSettingsState" class="space-y-4" @submit="onEditSettingsSubmit">
              <UFormField :label="t('kindergartens.timezone')" name="timezone">
                <UInput v-model="editSettingsState.timezone" class="w-full" />
              </UFormField>
              <UFormField :label="t('kindergartens.defaultLocale')" name="defaultLocale">
                <USelect
                  v-model="editSettingsState.defaultLocale"
                  :items="[{ label: 'Română', value: 'ro' }, { label: 'English', value: 'en' }]"
                  class="w-full"
                />
              </UFormField>
              <UFormField :label="t('kindergartens.workingHoursStart')" name="workingHoursStart">
                <UInput v-model="editSettingsState.workingHoursStart" class="w-full" />
              </UFormField>
              <UFormField :label="t('kindergartens.workingHoursEnd')" name="workingHoursEnd">
                <UInput v-model="editSettingsState.workingHoursEnd" class="w-full" />
              </UFormField>
              <UButton type="submit" color="primary" loading-auto :loading="loading">{{ t('common.save') }}</UButton>
            </UForm>
          </section>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="confirmModalOpen">
      <template #header>
        <h2 class="text-lg font-semibold">{{ confirmTitle }}</h2>
      </template>
      <template #body>
        <p class="text-sm text-neutral-600">{{ confirmBody }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <UButton color="neutral" variant="soft" @click="confirmModalOpen = false">{{ t('common.cancel') }}</UButton>
          <UButton color="primary" loading-auto :loading="loading" @click="onConfirmStatusChange">
            {{ t('kindergartens.confirm') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
