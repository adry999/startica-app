<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()
const { can } = usePermissions()
const tenantStore = useTenantStore()
const { stats, groups, loading, fetchAll } = useDashboard()

const selectedKgId = computed(() => tenantStore.selectedKindergartenId)

useLazyAsyncData(
  'dashboard',
  () => fetchAll(selectedKgId.value),
  { watch: [selectedKgId] },
)
</script>

<template>
  <div class="space-y-6">
    <!-- Page header -->
    <div>
      <h1 class="text-xl font-semibold text-slate-800">{{ t('dashboard.pageTitle') }}</h1>
      <p class="mt-0.5 text-sm text-slate-400">{{ t('dashboard.pageSubtitle') }}</p>
    </div>

    <!-- Stat cards -->
    <div class="grid grid-cols-4 gap-4">
      <!-- Enrolled children -->
      <div class="rounded-xl border border-border bg-white p-5">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('dashboard.stats.children') }}</p>
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
            <UIcon name="i-heroicons-academic-cap" class="h-5 w-5 text-teal-600" />
          </div>
        </div>
        <p class="mt-3 text-3xl font-semibold tabular-nums text-slate-800">
          <span v-if="loading" class="text-slate-300">—</span>
          <span v-else>{{ stats?.totalChildren ?? 0 }}</span>
        </p>
      </div>

      <!-- Active groups -->
      <div class="rounded-xl border border-border bg-white p-5">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('dashboard.stats.groups') }}</p>
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-sage/20">
            <UIcon name="i-heroicons-user-group" class="h-5 w-5 text-teal-600" />
          </div>
        </div>
        <p class="mt-3 text-3xl font-semibold tabular-nums text-slate-800">
          <span v-if="loading" class="text-slate-300">—</span>
          <span v-else>{{ stats?.totalGroups ?? 0 }}</span>
        </p>
      </div>

      <!-- Active staff -->
      <div class="rounded-xl border border-border bg-white p-5">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('dashboard.stats.staff') }}</p>
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
            <UIcon name="i-heroicons-users" class="h-5 w-5 text-slate-500" />
          </div>
        </div>
        <p class="mt-3 text-3xl font-semibold tabular-nums text-slate-800">
          <span v-if="loading" class="text-slate-300">—</span>
          <span v-else>{{ stats?.activeStaff ?? 0 }}</span>
        </p>
      </div>

      <!-- Attendance (coming soon) -->
      <div class="rounded-xl border border-border bg-white p-5">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('dashboard.stats.attendance') }}</p>
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
            <UIcon name="i-heroicons-chart-bar" class="h-5 w-5 text-slate-300" />
          </div>
        </div>
        <p class="mt-3 text-sm text-slate-300">{{ t('dashboard.attendanceComingSoon') }}</p>
      </div>
    </div>

    <!-- Quick actions + Active groups -->
    <div class="grid grid-cols-3 gap-6">
      <!-- Quick actions (only shown when there are accessible actions) -->
      <div v-if="can('read', 'staff')" class="rounded-xl border border-border bg-white p-5">
        <h2 class="mb-4 text-sm font-semibold text-slate-800">{{ t('dashboard.quickActions') }}</h2>
        <div class="space-y-1">
          <NuxtLink
            to="/staff"
            class="flex items-center gap-3 rounded-lg p-3 text-sm text-slate-600 transition-colors hover:bg-app-bg"
          >
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50">
              <UIcon name="i-heroicons-user-plus" class="h-5 w-5 text-teal-600" />
            </div>
            {{ t('staff.invite') }}
          </NuxtLink>
        </div>
      </div>

      <!-- Active groups table -->
      <div :class="can('read', 'staff') ? 'col-span-2' : 'col-span-3'" class="rounded-xl border border-border bg-white">
        <div class="border-b border-border px-5 py-4">
          <h2 class="text-sm font-semibold text-slate-800">{{ t('dashboard.activeGroups') }}</h2>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-12">
          <UIcon name="i-heroicons-arrow-path" class="h-5 w-5 animate-spin text-slate-300" />
        </div>
        <p v-else-if="groups.length === 0" class="py-12 text-center text-sm text-slate-400">
          {{ t('dashboard.groupsEmpty') }}
        </p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="border-b border-border bg-app-bg">
              <th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('dashboard.table.group') }}</th>
              <th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('dashboard.table.ageRange') }}</th>
              <th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('dashboard.table.educator') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="group in groups"
              :key="group.id"
              class="border-b border-border last:border-0"
            >
              <td class="px-5 py-3 font-medium text-slate-800">{{ group.name }}</td>
              <td class="px-5 py-3 text-slate-500">{{ group.ageRange ?? '—' }}</td>
              <td class="px-5 py-3 text-slate-500">{{ group.educatorName ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
