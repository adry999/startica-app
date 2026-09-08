<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()
const { canManagePoolTrainer } = usePermissions()
const tenantStore = useTenantStore()
const authStore = useAuthStore()
const { items: groups, fetchAll: fetchGroups } = useGroups()

const selectedKgId = computed(() => tenantStore.selectedKindergartenId)
const trainerUserId = computed(() => authStore.user?.id ?? '')
const canEdit = computed(() => selectedKgId.value && canManagePoolTrainer(selectedKgId.value, trainerUserId.value))

useLazyAsyncData('pool-settings-groups', () => fetchGroups(selectedKgId.value), { watch: [selectedKgId] })

const groupOptions = computed(() => [
  { label: t('pool.pattern.noGroup'), value: null },
  ...groups.value.map(g => ({ label: g.name, value: g.id })),
])
</script>

<template>
  <div class="space-y-6">
    <BasePageHeader :title="t('pool.pageTitle')" :subtitle="t('pool.settingsTab')" />

    <p v-if="!selectedKgId" class="text-sm text-slate-400">{{ t('staff.selectKindergarten') }}</p>

    <template v-else>
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
