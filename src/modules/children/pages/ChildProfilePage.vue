<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { updateChildSchema, type UpdateChildInput } from '~/shared/schemas/children.schema'
import { createGuardianSchema, updateGuardianSchema, type CreateGuardianInput, type UpdateGuardianInput } from '~/shared/schemas/guardian.schema'
import type { Child } from '../types/children.types'
import type { Guardian } from '../types/guardian.types'

const props = defineProps<{ id: string }>()

const { t } = useI18n()
const toast = useToast()
const { can } = usePermissions()
const childrenStore = useChildrenStore()
const groupsStore = useGroupsStore()
const { items: guardians, loading: guardiansLoading, error: guardiansError, fetchForChild, create: createGuardian, update: updateGuardian, remove: removeGuardian } = useGuardians()

const canMutate = computed(() => can('update', 'children'))

const child = ref<Child | null>(null)

const { pending: childLoading } = useLazyAsyncData(
  `child-${props.id}`,
  async () => {
    const result = await childrenStore.fetchById(props.id)
    if (result) child.value = result
  },
)

useLazyAsyncData(
  `child-guardians-${props.id}`,
  () => fetchForChild(props.id),
)

useLazyAsyncData(
  'child-profile-groups',
  () => child.value ? groupsStore.fetchAll(child.value.kindergartenId) : Promise.resolve(),
  { watch: [child] },
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
  const ok = await childrenStore.update(child.value.id, event.data)
  editLoading.value = false
  if (!ok) { toast.add({ title: childrenStore.error ?? 'update_failed', color: 'error' }); return }
  child.value = childrenStore.items.find(c => c.id === props.id) ?? await childrenStore.fetchById(props.id) ?? child.value
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
  } else if (guardiansError.value) {
    toast.add({ title: guardiansError.value, color: 'error' })
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
  } else if (guardiansError.value) {
    toast.add({ title: guardiansError.value, color: 'error' })
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
  } else if (guardiansError.value) {
    toast.add({ title: guardiansError.value, color: 'error' })
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
            <BaseAvatar :name="child.fullName" size="lg" class="mx-auto" />
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

    <div v-else class="rounded-2xl border border-border bg-white p-12 text-center text-sm text-slate-400">
      {{ t('children.notFound') }}
    </div>

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
