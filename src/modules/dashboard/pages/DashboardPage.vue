<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()
const { can } = usePermissions()
const tenantStore = useTenantStore()
const { stats, groups, activity, staffOnDuty, loading, fetchAll } = useDashboard()

const selectedKgId = computed(() => tenantStore.selectedKindergartenId)

useLazyAsyncData('dashboard', () => fetchAll(selectedKgId.value), { watch: [selectedKgId] })

// ── Quick actions ────────────────────────────────────────────────────────────
const quickActions = computed(() => [
  {
    label: t('dashboard.actions.addChild'),
    icon: 'i-heroicons-user-plus',
    to: '/children',
    bgColor: 'bg-teal-50',
    iconColor: 'text-teal-600',
    show: can('create', 'children'),
  },
  {
    label: t('dashboard.actions.inviteStaff'),
    icon: 'i-heroicons-paper-airplane',
    to: '/staff',
    bgColor: 'bg-brand-yellow/20',
    iconColor: 'text-brand-gold',
    show: can('create', 'staff'),
  },
  {
    label: t('dashboard.actions.groups'),
    icon: 'i-heroicons-users',
    to: '/groups',
    bgColor: 'bg-slate-100',
    iconColor: 'text-slate-500',
    show: can('read', 'groups'),
  },
  {
    label: t('dashboard.actions.children'),
    icon: 'i-heroicons-academic-cap',
    to: '/children',
    bgColor: 'bg-teal-50',
    iconColor: 'text-teal-600',
    show: can('read', 'children'),
  },
].filter(a => a.show))

// ── Activity helpers ─────────────────────────────────────────────────────────
function activityLabel(action: string, entity: string): string {
  const key = `dashboard.activity.${action}_${entity}`
  const result = t(key)
  return result === key ? t('dashboard.activity.default') : result
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function activityDotColor(action: string): string {
  if (action === 'INSERT') return 'bg-teal-500'
  if (action === 'DELETE') return 'bg-error'
  return 'bg-warning'
}

function roleInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}
</script>

<template>
  <div class="space-y-6">
    <!-- ── Page header ───────────────────────────────────────────────────── -->
    <div>
      <h1 class="text-xl font-semibold text-slate-800">{{ t('dashboard.pageTitle') }}</h1>
      <p class="mt-0.5 text-sm text-slate-400">{{ t('dashboard.pageSubtitle') }}</p>
    </div>

    <!-- ── Row 1: Stat cards ─────────────────────────────────────────────── -->
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div class="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium uppercase tracking-widest text-slate-400">{{ t('dashboard.stats.children') }}</p>
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50">
            <UIcon name="i-heroicons-academic-cap" class="h-5 w-5 text-teal-600" />
          </div>
        </div>
        <p class="mt-3 text-3xl font-semibold tabular-nums text-slate-800">
          <span v-if="loading" class="animate-pulse text-slate-200">—</span>
          <span v-else>{{ stats?.totalChildren ?? 0 }}</span>
        </p>
      </div>

      <div class="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium uppercase tracking-widest text-slate-400">{{ t('dashboard.stats.groups') }}</p>
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-sage/20">
            <UIcon name="i-heroicons-user-group" class="h-5 w-5 text-teal-600" />
          </div>
        </div>
        <p class="mt-3 text-3xl font-semibold tabular-nums text-slate-800">
          <span v-if="loading" class="animate-pulse text-slate-200">—</span>
          <span v-else>{{ stats?.totalGroups ?? 0 }}</span>
        </p>
      </div>

      <div class="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium uppercase tracking-widest text-slate-400">{{ t('dashboard.stats.staff') }}</p>
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
            <UIcon name="i-heroicons-users" class="h-5 w-5 text-slate-500" />
          </div>
        </div>
        <p class="mt-3 text-3xl font-semibold tabular-nums text-slate-800">
          <span v-if="loading" class="animate-pulse text-slate-200">—</span>
          <span v-else>{{ stats?.activeStaff ?? 0 }}</span>
        </p>
      </div>

      <div class="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium uppercase tracking-widest text-slate-400">{{ t('dashboard.stats.attendance') }}</p>
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
            <UIcon name="i-heroicons-chart-bar" class="h-5 w-5 text-slate-300" />
          </div>
        </div>
        <p class="mt-3 text-sm font-medium text-slate-300">{{ t('dashboard.attendanceComingSoon') }}</p>
      </div>
    </div>

    <!-- ── Row 2: Recent Activity + Quick Actions ─────────────────────────── -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">

      <!-- Recent Activity (2/3) -->
      <div class="rounded-2xl border border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)] lg:col-span-2">
        <div class="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 class="text-sm font-semibold text-slate-800">{{ t('dashboard.recentActivity') }}</h2>
          <NuxtLink to="/children" class="text-xs font-medium text-teal-600 hover:text-teal-700">
            {{ t('dashboard.viewAllLog') }}
          </NuxtLink>
        </div>

        <!-- Loading skeleton -->
        <div v-if="loading" class="divide-y divide-border">
          <div v-for="i in 4" :key="i" class="flex items-start gap-3 px-5 py-4">
            <div class="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-slate-200" />
            <div class="flex-1 space-y-2">
              <div class="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
              <div class="h-2.5 w-3/4 animate-pulse rounded bg-slate-100" />
            </div>
            <div class="h-2.5 w-10 animate-pulse rounded bg-slate-100" />
          </div>
        </div>

        <p v-else-if="activity.length === 0" class="py-10 text-center text-sm text-slate-400">
          {{ t('dashboard.activityEmpty') }}
        </p>

        <div v-else class="divide-y divide-border">
          <div v-for="entry in activity" :key="entry.id" class="flex items-start gap-3 px-5 py-3.5">
            <div :class="['mt-2 h-2 w-2 shrink-0 rounded-full', activityDotColor(entry.action)]" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-slate-700">
                {{ activityLabel(entry.action, entry.entity) }}
              </p>
              <p class="truncate text-xs text-slate-400">
                {{ entry.userName }} · {{ entry.entity }}
              </p>
            </div>
            <span class="shrink-0 tabular-nums text-xs text-slate-400">{{ formatTime(entry.createdAt) }}</span>
          </div>
        </div>
      </div>

      <!-- Quick Actions + Attendance notice (1/3) -->
      <div class="flex flex-col gap-4">
        <div class="rounded-2xl border border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
          <div class="border-b border-border px-5 py-4">
            <h2 class="text-sm font-semibold text-slate-800">{{ t('dashboard.quickActions') }}</h2>
          </div>
          <div class="grid grid-cols-2 gap-3 p-4">
            <NuxtLink
              v-for="action in quickActions"
              :key="action.label"
              :to="action.to"
              class="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-app-bg p-4 text-center transition-colors hover:bg-slate-50"
            >
              <div :class="['flex h-10 w-10 items-center justify-center rounded-xl', action.bgColor]">
                <UIcon :name="action.icon" :class="['h-5 w-5', action.iconColor]" />
              </div>
              <span class="text-xs font-medium leading-tight text-slate-600">{{ action.label }}</span>
            </NuxtLink>
          </div>
        </div>

        <!-- Attendance coming soon — occupies "Facility Reminder" slot -->
        <div class="rounded-2xl bg-teal-700 p-5">
          <div class="flex items-start gap-3">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <UIcon name="i-heroicons-calendar-days" class="h-5 w-5 text-teal-300" />
            </div>
            <div>
              <p class="text-sm font-semibold text-white">{{ t('dashboard.stats.attendance') }}</p>
              <p class="mt-1 text-xs leading-relaxed text-white/60">{{ t('nav.comingSoon') }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Row 3: Active Groups + Staff on Duty ───────────────────────────── -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">

      <!-- Active Groups table (2/3) -->
      <div class="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)] lg:col-span-2">
        <div class="border-b border-border px-5 py-4">
          <h2 class="text-sm font-semibold text-slate-800">{{ t('dashboard.activeGroups') }}</h2>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-12">
          <UIcon name="i-heroicons-arrow-path" class="h-5 w-5 animate-spin text-slate-300" />
        </div>
        <p v-else-if="groups.length === 0" class="py-10 text-center text-sm text-slate-400">
          {{ t('dashboard.groupsEmpty') }}
        </p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border bg-app-bg">
                <th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400">{{ t('dashboard.table.group') }}</th>
                <th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400">{{ t('dashboard.table.educator') }}</th>
                <th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400">{{ t('dashboard.table.children') }}</th>
                <th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400">{{ t('dashboard.table.status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="group in groups"
                :key="group.id"
                class="border-b border-border transition-colors last:border-0 hover:bg-app-bg"
              >
                <td class="px-5 py-3.5">
                  <p class="font-medium text-slate-800">{{ group.name }}</p>
                  <p v-if="group.ageRange" class="text-xs text-slate-400">{{ group.ageRange }}</p>
                </td>
                <td class="px-5 py-3.5 text-slate-500">{{ group.educatorName ?? '—' }}</td>
                <td class="px-5 py-3.5 tabular-nums text-slate-600">{{ group.childrenCount }}</td>
                <td class="px-5 py-3.5">
                  <span class="inline-flex rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
                    {{ t('dashboard.active') }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Staff on Duty (1/3) -->
      <div class="rounded-2xl border border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
        <div class="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 class="text-sm font-semibold text-slate-800">{{ t('dashboard.staffOnDuty') }}</h2>
          <span v-if="staffOnDuty.length > 0" class="flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
            <span class="h-1.5 w-1.5 rounded-full bg-teal-500" />
            {{ staffOnDuty.length }} {{ t('dashboard.active') }}
          </span>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="divide-y divide-border">
          <div v-for="i in 3" :key="i" class="flex items-center gap-3 px-5 py-3.5">
            <div class="h-8 w-8 animate-pulse rounded-full bg-slate-100" />
            <div class="flex-1 space-y-1.5">
              <div class="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
              <div class="h-2.5 w-1/2 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        </div>

        <p v-else-if="staffOnDuty.length === 0" class="py-10 text-center text-sm text-slate-400">
          {{ selectedKgId === 'ALL' ? t('staff.selectKindergarten') : t('dashboard.staffOnDutyEmpty') }}
        </p>

        <div v-else class="divide-y divide-border">
          <div v-for="member in staffOnDuty" :key="member.id" class="flex items-center gap-3 px-5 py-3">
            <span class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white">
              {{ roleInitials(member.fullName) }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-slate-800">{{ member.fullName }}</p>
              <p class="text-xs text-slate-400">{{ t(`auth.role.${member.role}`) }}</p>
            </div>
          </div>
        </div>

        <div v-if="!loading && staffOnDuty.length > 0" class="border-t border-border px-5 py-3">
          <NuxtLink to="/staff" class="text-xs font-medium text-teal-600 hover:text-teal-700">
            {{ t('nav.staff') }} →
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
