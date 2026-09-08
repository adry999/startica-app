<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()
const { canManagePoolTrainer } = usePermissions()
const tenantStore = useTenantStore()
const authStore = useAuthStore()
const { items: groups, fetchAll: fetchGroups } = useGroups()

const selectedKgId = computed(() => tenantStore.selectedKindergartenId)
const trainerUserId = computed(() => authStore.user?.id ?? '')
const canEdit = computed((): boolean => selectedKgId.value ? canManagePoolTrainer(selectedKgId.value, trainerUserId.value) : false)

useLazyAsyncData('pool-settings-groups', async () => { if (selectedKgId.value) await fetchGroups(selectedKgId.value); return true }, { watch: [selectedKgId] })

const groupOptions = computed(() => [
  { label: t('pool.pattern.noGroup'), value: null },
  ...groups.value.map(g => ({ label: g.name, value: g.id })),
])
</script>

<template>
  <div class="space-y-6">
    <BasePageHeader :title="t('pool.pageTitle')" :subtitle="t('pool.settingsTab')" />

    <template v-if="selectedKgId">
      <PoolAvailabilityEditor :kindergarten-id="selectedKgId" :trainer-user-id="trainerUserId" :can-edit="canEdit" />
      <PoolPatternList
        :kindergarten-id="selectedKgId"
        :trainer-user-id="trainerUserId"
        :can-edit="canEdit"
        :group-options="groupOptions"
      />
    </template>
  </div>
</template>
