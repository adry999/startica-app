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

const activeFilter = ref<'all' | 'active' | 'archived'>('active')
const filteredItems = computed(() => {
  if (activeFilter.value === 'active')   return items.value.filter(g => g.status === 'active')
  if (activeFilter.value === 'archived') return items.value.filter(g => g.status === 'archived')
  return items.value
})

const filterTabs = computed(() =>
  (['active', 'all', 'archived'] as const)
    .map(f => ({ label: t(`groups.filter.${f}`), value: f })),
)

const activeItems     = computed(() => items.value.filter(g => g.status === 'active'))
const totalEnrolled   = computed(() => activeItems.value.reduce((s, g) => s + g.childrenCount, 0))
const educatorsCount  = computed(() => activeItems.value.filter(g => g.educatorId !== null).length)
const totalCapacity   = computed(() => {
  const withCap = activeItems.value.filter(g => g.capacity !== null)
  return withCap.length > 0 ? withCap.reduce((s, g) => s + (g.capacity ?? 0), 0) : null
})

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

const educatorOptions = computed(() => [
  { label: t('groups.noEducator'), value: null },
  ...staffStore.items
    .filter(s => s.status === 'active' && s.role === 'educator')
    .map(s => ({ label: s.fullName, value: s.id })),
])

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
    <BasePageHeader :title="t('groups.pageTitle')" :subtitle="t('groups.pageSubtitle')">
      <template #actions>
        <UButton v-if="canMutate && selectedKgId !== 'ALL'" color="primary" @click="openCreate">
          <UIcon name="i-heroicons-plus" class="mr-1.5 h-5 w-5" />
          {{ t('groups.createTitle') }}
        </UButton>
      </template>
    </BasePageHeader>

    <UAlert v-if="error" color="error" variant="soft" :description="error" />

    <!-- Stats bar -->
    <div v-if="selectedKgId !== 'ALL'" class="grid grid-cols-4 gap-4">
      <BaseStatCard :label="t('groups.stats.totalGroups')" :value="activeItems.length" icon="i-heroicons-user-group" icon-class="bg-teal-50 text-teal-600" :loading="loading" />
      <BaseStatCard :label="t('groups.stats.totalEnrollment')" :value="totalEnrolled" icon="i-heroicons-face-smile" icon-class="bg-brand-yellow/20 text-brand-gold" :loading="loading" />
      <BaseStatCard :label="t('groups.stats.educators')" :value="educatorsCount" icon="i-heroicons-identification" icon-class="bg-brand-sage/20 text-teal-600" :loading="loading" />
      <BaseStatCard :label="t('groups.stats.totalCapacity')" :value="totalCapacity ?? '—'" icon="i-heroicons-chart-pie" icon-class="bg-slate-100 text-slate-500" :loading="loading" />
    </div>

    <p v-if="selectedKgId === 'ALL'" class="text-sm text-slate-400">{{ t('staff.selectKindergarten') }}</p>

    <template v-else>
      <!-- Filter tabs -->
      <BaseFilterTabs v-model="activeFilter" :items="filterTabs" />

      <!-- Loading skeletons -->
      <div v-if="loading" class="grid grid-cols-3 gap-6">
        <div
          v-for="i in 3"
          :key="i"
          class="h-64 animate-pulse rounded-2xl border border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)]"
        />
      </div>

      <!-- Empty state -->
      <div
        v-else-if="filteredItems.length === 0"
        class="rounded-2xl border border-border bg-white py-16 text-center text-sm text-slate-400 shadow-[0_1px_3px_rgba(16,24,40,0.04)]"
      >
        {{ t('groups.empty') }}
      </div>

      <!-- Card grid -->
      <div v-else class="grid grid-cols-3 gap-6">
        <div
          v-for="(group, idx) in filteredItems"
          :key="group.id"
          class="flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)]"
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
                    :aria-label="t('common.edit')"
                    @click="openEdit(group)"
                  />
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :icon="group.status === 'active' ? 'i-heroicons-archive-box' : 'i-heroicons-arrow-path'"
                    :aria-label="group.status === 'active' ? t('groups.archive') : t('groups.restore')"
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
