<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { updateGroupSchema, type UpdateGroupInput } from '~/shared/schemas/groups.schema'
import * as groupsService from '../services/groups.service'
import { listChildrenByGroup } from '~/modules/children/services/children.service'
import { useSupabaseClient } from '~/core/supabase/client'
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
