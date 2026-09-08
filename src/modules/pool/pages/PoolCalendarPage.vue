<script setup lang="ts">
import { computed, ref } from 'vue'

const { t } = useI18n()
const { can, canManagePoolTrainer } = usePermissions()
const tenantStore = useTenantStore()
const { sessions, participants, loading, error, fetchSessions, cancelSession, fetchParticipants, addParticipant, removeParticipant } = usePool()
const { groupChildren, fetchByGroup } = useChildren()

const selectedKgId = computed(() => tenantStore.selectedKindergartenId)
const canView = computed(() => selectedKgId.value && can('view', 'pool', selectedKgId.value))

useLazyAsyncData('pool-sessions', async () => { canView.value && selectedKgId.value && await fetchSessions(selectedKgId.value) }, { watch: [selectedKgId] })

const drawerOpen = ref(false)
const activeSessionId = ref<string | null>(null)
const activeSession = computed(() => sessions.value.find(s => s.id === activeSessionId.value) ?? null)

// Children eligible to be added: active children in the session's group who
// aren't already an enrolled participant. Falls back to no options when the
// session has no group_id (ad-hoc sessions require picking children another way — out of scope for this plan, see DoD).
const childOptions = computed(() => {
  if (!activeSession.value?.groupId) return []
  const enrolledIds = new Set((participants.value[activeSession.value.id] ?? []).map(p => p.childId))
  return groupChildren.value
    .filter(c => c.status === 'enrolled' && !enrolledIds.has(c.id))
    .map(c => ({ label: c.fullName, value: c.id }))
})

function openParticipants(sessionId: string) {
  activeSessionId.value = sessionId
  drawerOpen.value = true
  fetchParticipants(sessionId)
  const session = sessions.value.find(s => s.id === sessionId)
  if (session?.groupId) fetchByGroup(session.groupId)
}

const cancelOpen = ref(false)
const cancelTargetId = ref<string | null>(null)

function openCancel(sessionId: string) {
  cancelTargetId.value = sessionId
  cancelOpen.value = true
}

async function onCancelConfirm() {
  if (!cancelTargetId.value) return
  await cancelSession(cancelTargetId.value)
  cancelOpen.value = false
}

function canManageSession(trainerUserId: string): boolean {
  return selectedKgId.value ? canManagePoolTrainer(selectedKgId.value, trainerUserId) : false
}
</script>

<template>
  <div class="space-y-6">
    <BasePageHeader :title="t('pool.pageTitle')" :subtitle="t('pool.pageSubtitle')" />

    <UAlert v-if="error" color="error" variant="soft" :description="error" />

    <p v-if="!canView" class="text-sm text-slate-400">{{ t('staff.selectKindergarten') }}</p>

    <template v-else>
      <div v-if="loading" class="text-sm text-slate-400">…</div>
      <div v-else-if="sessions.length === 0" class="rounded-2xl border border-border bg-white py-16 text-center text-sm text-slate-400">
        {{ t('pool.session.empty') }}
      </div>
      <div v-else class="space-y-3">
        <PoolSessionCard
          v-for="session in sessions"
          :key="session.id"
          :session="session"
          :can-manage="canManageSession(session.trainerUserId)"
          @cancel="openCancel"
          @view-participants="openParticipants"
        />
      </div>
    </template>

    <UModal v-model:open="drawerOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('pool.participants.title') }}</h2>
      </template>
      <template #body>
        <PoolParticipantList
          v-if="activeSession"
          :participants="participants[activeSession.id] ?? []"
          :child-options="childOptions"
          :can-edit="canManageSession(activeSession.trainerUserId)"
          :is-full="activeSession.participantCount >= activeSession.capacity"
          @add-child="(childId) => addParticipant(activeSession!.id, childId)"
          @remove="(participantId) => removeParticipant(activeSession!.id, participantId)"
        />
      </template>
    </UModal>

    <UModal v-model:open="cancelOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('pool.session.confirmCancelTitle') }}</h2>
      </template>
      <template #body>
        <p class="text-sm text-slate-500">{{ t('pool.session.confirmCancelBody') }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="cancelOpen = false">{{ t('common.cancel') }}</UButton>
          <UButton color="error" loading-auto :loading="loading" @click="onCancelConfirm">{{ t('common.confirm') }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
