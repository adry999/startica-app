<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { trainerAvailabilitySchema, type TrainerAvailabilityInput } from '~/shared/schemas/pool.schema'

const props = defineProps<{ kindergartenId: string; trainerUserId: string; canEdit: boolean }>()

const { t } = useI18n()
const toast = useToast()
const { availability, loading, error, fetchAvailability, addAvailability, removeAvailability } = usePool()

useLazyAsyncData(
  `pool-availability-${props.kindergartenId}-${props.trainerUserId}`,
  async () => {
    await fetchAvailability(props.kindergartenId, props.trainerUserId)
    return true
  },
)

const weekdayOptions = [0, 1, 2, 3, 4, 5, 6].map(d => ({ label: t(`pool.weekday.${d}`), value: d }))

const addOpen = ref(false)
const addState = reactive<Partial<TrainerAvailabilityInput>>({ weekday: 1, startTime: undefined, endTime: undefined })

function openAdd() {
  addState.weekday = 1
  addState.startTime = undefined
  addState.endTime = undefined
  addOpen.value = true
}

async function onAddSubmit(event: FormSubmitEvent<TrainerAvailabilityInput>) {
  const ok = await addAvailability({
    kindergartenId: props.kindergartenId,
    trainerUserId: props.trainerUserId,
    weekday: event.data.weekday,
    startTime: event.data.startTime,
    endTime: event.data.endTime,
  })
  if (ok) {
    addOpen.value = false
    toast.add({ title: t('pool.availability.add'), color: 'success' })
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-slate-800">{{ t('pool.availability.title') }}</h3>
      <UButton v-if="canEdit" size="xs" color="primary" variant="soft" @click="openAdd">
        {{ t('pool.availability.add') }}
      </UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :description="error" />

    <div v-if="loading" class="text-sm text-slate-400">…</div>
    <div v-else-if="availability.length === 0" class="text-sm text-slate-400">{{ t('pool.availability.empty') }}</div>
    <ul v-else class="space-y-2">
      <li
        v-for="window in availability"
        :key="window.id"
        class="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-sm"
      >
        <span>{{ t(`pool.weekday.${window.weekday}`) }} — {{ window.startTime }}–{{ window.endTime }}</span>
        <UButton v-if="canEdit" size="xs" color="neutral" variant="ghost" icon="i-heroicons-trash" @click="removeAvailability(window.id)" />
      </li>
    </ul>

    <UModal v-model:open="addOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('pool.availability.add') }}</h2>
      </template>
      <template #body>
        <UForm :schema="trainerAvailabilitySchema" :state="addState" class="space-y-4" @submit="onAddSubmit">
          <UFormField :label="t('pool.availability.weekday')" name="weekday">
            <USelect v-model="addState.weekday" :items="weekdayOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.availability.startTime')" name="startTime">
            <UInput v-model="addState.startTime" placeholder="09:00" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.availability.endTime')" name="endTime">
            <UInput v-model="addState.endTime" placeholder="12:00" class="w-full" />
          </UFormField>
          <UButton type="submit" color="primary" block loading-auto :loading="loading">
            {{ t('pool.availability.add') }}
          </UButton>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
