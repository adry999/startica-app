<script setup lang="ts">
import { ref } from 'vue'
import type { SessionParticipant } from '../types/pool.types'

defineProps<{
  participants: SessionParticipant[]
  childOptions: Array<{ label: string; value: string }>
  canEdit: boolean
  isFull: boolean
}>()
const emit = defineEmits<{ 'add-child': [childId: string]; remove: [participantId: string] }>()

const { t } = useI18n()
const selectedChildId = ref<string | undefined>(undefined)

function onAdd() {
  if (selectedChildId.value) {
    emit('add-child', selectedChildId.value)
    selectedChildId.value = undefined
  }
}
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-sm font-semibold text-slate-800">{{ t('pool.participants.title') }}</h3>

    <div v-if="participants.length === 0" class="text-sm text-slate-400">{{ t('pool.participants.empty') }}</div>
    <ul v-else class="space-y-2">
      <li
        v-for="participant in participants"
        :key="participant.id"
        class="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-sm"
      >
        <span>{{ participant.childName }}</span>
        <UButton v-if="canEdit" size="xs" color="neutral" variant="ghost" icon="i-heroicons-x-mark" @click="emit('remove', participant.id)" />
      </li>
    </ul>

    <p v-if="isFull" class="text-xs text-warning">{{ t('pool.participants.full') }}</p>
    <div v-else-if="canEdit" class="flex items-center gap-2">
      <USelect v-model="selectedChildId" :items="childOptions" class="w-full" />
      <UButton size="sm" color="primary" :disabled="!selectedChildId" @click="onAdd">
        {{ t('pool.participants.addChild') }}
      </UButton>
    </div>
  </div>
</template>
