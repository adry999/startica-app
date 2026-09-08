<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()
const tenantStore = useTenantStore()
const { activity, loading, error, fetchAuditLog } = useDashboard()
const selectedKgId = computed(() => tenantStore.selectedKindergartenId)

useLazyAsyncData('audit-log', () => fetchAuditLog(selectedKgId.value), { watch: [selectedKgId] })

function activityLabel(action: string, entity: string): string {
  const key = `dashboard.activity.${action}_${entity}`
  const label = t(key)
  return label === key ? t('dashboard.activity.default') : label
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}
</script>

<template>
  <div class="space-y-6">
    <BasePageHeader :title="t('dashboard.recentActivity')" :subtitle="t('dashboard.pageSubtitle')" />

    <UAlert v-if="error" color="error" variant="soft" :description="error" />

    <div class="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
      <div v-if="loading" class="space-y-3 p-5">
        <div v-for="index in 6" :key="index" class="h-12 animate-pulse rounded bg-slate-50" />
      </div>
      <p v-else-if="activity.length === 0" class="p-10 text-center text-sm text-slate-400">
        {{ t('dashboard.activityEmpty') }}
      </p>
      <ul v-else class="divide-y divide-border">
        <li v-for="entry in activity" :key="entry.id" class="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-sm font-medium text-slate-800">{{ activityLabel(entry.action, entry.entity) }}</p>
            <p class="text-xs text-slate-500">{{ entry.userName }}</p>
          </div>
          <time class="text-xs text-slate-400" :datetime="entry.createdAt">{{ formatDate(entry.createdAt) }}</time>
        </li>
      </ul>
    </div>
  </div>
</template>
