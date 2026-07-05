<script setup lang="ts">
import type { PoolSession } from '../types/pool.types'

defineProps<{ session: PoolSession; canManage: boolean }>()
const emit = defineEmits<{ cancel: [id: string]; 'view-participants': [id: string] }>()

const { t } = useI18n()
</script>

<template>
  <div class="flex items-center justify-between rounded-xl border border-border bg-white px-4 py-3 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
    <div>
      <p class="text-sm font-medium text-slate-800">{{ session.sessionDate }} · {{ session.startTime }}–{{ session.endTime }}</p>
      <p class="text-xs text-slate-500">
        {{ t('pool.session.capacity', { enrolled: session.participantCount, capacity: session.capacity }) }}
      </p>
    </div>
    <div class="flex items-center gap-2">
      <UBadge v-if="session.status === 'cancelled'" color="neutral" variant="soft" size="xs">
        {{ t('pool.session.cancelled') }}
      </UBadge>
      <UButton size="xs" color="neutral" variant="ghost" @click="emit('view-participants', session.id)">
        {{ t('pool.session.viewParticipants') }}
      </UButton>
      <UButton
        v-if="canManage && session.status === 'scheduled'"
        size="xs" color="error" variant="ghost" icon="i-heroicons-x-circle"
        @click="emit('cancel', session.id)"
      />
    </div>
  </div>
</template>
