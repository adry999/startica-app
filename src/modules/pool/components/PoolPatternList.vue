<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { schedulePatternSchema, type SchedulePatternInput } from '~/shared/schemas/pool.schema'

const props = defineProps<{
  kindergartenId: string
  trainerUserId: string
  canEdit: boolean
  groupOptions: Array<{ label: string; value: string | null }>
}>()

const { t } = useI18n()
const toast = useToast()
const { patterns, loading, error, fetchPatterns, createPattern, deletePattern } = usePool()

useLazyAsyncData(
  `pool-patterns-${props.kindergartenId}-${props.trainerUserId}`,
  () => fetchPatterns(props.kindergartenId, props.trainerUserId),
)

const weekdayOptions = [0, 1, 2, 3, 4, 5, 6].map(d => ({ label: t(`pool.weekday.${d}`), value: d }))

const addOpen = ref(false)
const addState = reactive<Partial<SchedulePatternInput>>({
  weekday: 1, startTime: undefined, endTime: undefined, defaultGroupId: null, capacity: 8,
  activeFrom: undefined, activeUntil: null,
})

function openAdd() {
  Object.assign(addState, {
    weekday: 1, startTime: undefined, endTime: undefined, defaultGroupId: null, capacity: 8,
    activeFrom: undefined, activeUntil: null,
  })
  addOpen.value = true
}

async function onAddSubmit(event: FormSubmitEvent<SchedulePatternInput>) {
  const ok = await createPattern({
    kindergartenId: props.kindergartenId,
    trainerUserId: props.trainerUserId,
    weekday: event.data.weekday,
    startTime: event.data.startTime,
    endTime: event.data.endTime,
    defaultGroupId: event.data.defaultGroupId ?? null,
    capacity: event.data.capacity,
    activeFrom: event.data.activeFrom,
    activeUntil: event.data.activeUntil ?? null,
  })
  if (ok) {
    addOpen.value = false
    toast.add({ title: t('pool.pattern.add'), color: 'success' })
  } else if (error.value === 'outside_trainer_availability') {
    toast.add({ title: t('pool.pattern.outsideAvailability'), color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-slate-800">{{ t('pool.pattern.title') }}</h3>
      <UButton v-if="canEdit" size="xs" color="primary" variant="soft" @click="openAdd">
        {{ t('pool.pattern.add') }}
      </UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :description="error" />

    <div v-if="loading" class="text-sm text-slate-400">…</div>
    <div v-else-if="patterns.length === 0" class="text-sm text-slate-400">{{ t('pool.pattern.empty') }}</div>
    <ul v-else class="space-y-2">
      <li
        v-for="pattern in patterns"
        :key="pattern.id"
        class="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-sm"
      >
        <span>
          {{ t(`pool.weekday.${pattern.weekday}`) }} {{ pattern.startTime }}–{{ pattern.endTime }}
          · {{ t('pool.pattern.capacity') }}: {{ pattern.capacity }}
        </span>
        <UButton v-if="canEdit" size="xs" color="neutral" variant="ghost" icon="i-heroicons-trash" @click="deletePattern(pattern.id)" />
      </li>
    </ul>

    <UModal v-model:open="addOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('pool.pattern.add') }}</h2>
      </template>
      <template #body>
        <UForm :schema="schedulePatternSchema" :state="addState" class="space-y-4" @submit="onAddSubmit">
          <UFormField :label="t('pool.availability.weekday')" name="weekday">
            <USelect v-model="addState.weekday" :items="weekdayOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.availability.startTime')" name="startTime">
            <UInput v-model="addState.startTime" placeholder="10:00" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.availability.endTime')" name="endTime">
            <UInput v-model="addState.endTime" placeholder="11:00" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.pattern.group')" name="defaultGroupId">
            <USelect v-model="addState.defaultGroupId" :items="groupOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.pattern.capacity')" name="capacity">
            <UInput v-model="addState.capacity" type="number" min="1" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.pattern.activeFrom')" name="activeFrom">
            <UInput v-model="addState.activeFrom" type="date" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.pattern.activeUntil')" name="activeUntil">
            <UInput v-model="addState.activeUntil" type="date" class="w-full" />
          </UFormField>
          <UButton type="submit" color="primary" block loading-auto :loading="loading">
            {{ t('pool.pattern.add') }}
          </UButton>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
