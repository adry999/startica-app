<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAttendance } from '../composables/useAttendance'

const { t, locale } = useI18n()
const toast = useToast()
const tenantStore = useTenantStore()
const groupsStore = useGroupsStore()
const childrenStore = useChildrenStore()
const { records, loading, error, fetchByGroup, markAttendance } = useAttendance()

const selectedDate = ref(new Date().toISOString().split('T')[0])
const selectedGroupId = ref<string | null>(null)
const selectedKgId = computed(() => tenantStore.selectedKindergartenId)

watch(selectedGroupId, async () => {
  if (selectedGroupId.value && selectedKgId.value !== 'ALL') {
    await fetchByGroup(selectedGroupId.value, selectedDate.value)
  }
})

watch(selectedDate, async () => {
  if (selectedGroupId.value && selectedKgId.value !== 'ALL') {
    await fetchByGroup(selectedGroupId.value, selectedDate.value)
  }
})

const groupChildren = computed(() => {
  if (!selectedGroupId.value || !childrenStore.items.length) return []
  const groupChildren = childrenStore.items.filter(
    c => c.groupId === selectedGroupId.value && c.status === 'enrolled',
  )
  return groupChildren.map(child => {
    const record = records.value.find(r => r.childId === child.id)
    return {
      ...child,
      attendanceId: record?.id,
      status: record?.status ?? null,
    }
  })
})

const summary = computed(() => {
  const stats: Record<string, number> = {
    present: 0,
    absent: 0,
    excused: 0,
    sick: 0,
  }
  records.value.forEach(r => {
    if (r.status in stats) stats[r.status]++
  })
  return stats as { present: number; absent: number; excused: number; sick: number }
})

async function handleStatusChange(childId: string, status: string) {
  if (!selectedKgId.value || selectedKgId.value === 'ALL' || !selectedGroupId.value) return

  const ok = await markAttendance(
    selectedKgId.value,
    childId,
    selectedDate.value,
    status as any,
    selectedGroupId.value,
  )

  if (ok) {
    toast.add({ title: t('attendance.markSuccess'), color: 'success' })
  } else {
    toast.add({ title: t('attendance.markError'), color: 'error' })
  }
}

async function markAllStatus(status: string) {
  if (!selectedKgId.value || selectedKgId.value === 'ALL' || !selectedGroupId.value) return

  const childIds = groupChildren.value.map(c => c.id)
  if (!childIds.length) return

  // Mark each child
  for (const childId of childIds) {
    await markAttendance(
      selectedKgId.value,
      childId,
      selectedDate.value,
      status as any,
      selectedGroupId.value,
    )
  }

  toast.add({ title: t('attendance.markSuccess'), color: 'success' })
}

const statusOptions = [
  { label: t('attendance.status.present'), value: 'present', icon: '✓', color: 'green' },
  { label: t('attendance.status.absent'), value: 'absent', icon: '✗', color: 'red' },
  { label: t('attendance.status.excused'), value: 'excused', icon: '~', color: 'yellow' },
  { label: t('attendance.status.sick'), value: 'sick', icon: '🤒', color: 'orange' },
]
</script>

<template>
  <div class="max-w-6xl space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">{{ t('attendance.pageTitle') }}</h1>
      <p class="mt-0.5 text-sm text-slate-400">{{ t('attendance.pageSubtitle') }}</p>
    </div>

    <div class="space-y-4 rounded-xl border border-border bg-white p-6">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class="mb-1.5 block text-sm font-medium text-slate-700">
            {{ t('attendance.date') }}
          </label>
          <input
            v-model="selectedDate"
            type="date"
            class="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium text-slate-700">
            {{ t('attendance.group') }}
          </label>
          <select
            v-model="selectedGroupId"
            class="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{{ t('common.select') }}</option>
            <option v-for="group in groupsStore.items" :key="group.id" :value="group.id">
              {{ group.name }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="selectedGroupId" class="space-y-4 rounded-xl border border-border bg-white p-6">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-800">{{ t('attendance.summary') }}</h2>
        <div class="flex gap-2">
          <button
            v-for="opt in statusOptions"
            :key="opt.value"
            @click="markAllStatus(opt.value)"
            class="rounded px-3 py-1 text-xs font-medium text-white"
            :class="{
              'bg-green-600': opt.value === 'present',
              'bg-red-600': opt.value === 'absent',
              'bg-yellow-600': opt.value === 'excused',
              'bg-orange-600': opt.value === 'sick',
            }"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-4 gap-4 text-center">
        <div class="rounded-lg bg-green-50 p-3">
          <div class="text-2xl font-bold text-green-700">{{ summary.present }}</div>
          <div class="text-xs text-green-600">{{ t('attendance.present') }}</div>
        </div>
        <div class="rounded-lg bg-red-50 p-3">
          <div class="text-2xl font-bold text-red-700">{{ summary.absent }}</div>
          <div class="text-xs text-red-600">{{ t('attendance.absent') }}</div>
        </div>
        <div class="rounded-lg bg-yellow-50 p-3">
          <div class="text-2xl font-bold text-yellow-700">{{ summary.excused }}</div>
          <div class="text-xs text-yellow-600">{{ t('attendance.excused') }}</div>
        </div>
        <div class="rounded-lg bg-orange-50 p-3">
          <div class="text-2xl font-bold text-orange-700">{{ summary.sick }}</div>
          <div class="text-xs text-orange-600">{{ t('attendance.sick') }}</div>
        </div>
      </div>
    </div>

    <div v-if="selectedGroupId" class="rounded-xl border border-border bg-white p-6">
      <div v-if="loading" class="text-center text-sm text-slate-500">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="!groupChildren.length" class="text-center text-sm text-slate-500">
        {{ t('attendance.noRecords') }}
      </div>
      <div v-else class="space-y-2">
        <div v-for="child in groupChildren" :key="child.id" class="flex items-center justify-between rounded-lg border border-slate-200 p-3">
          <div class="min-w-0 flex-1">
            <p class="font-medium text-slate-800">{{ child.firstName }} {{ child.lastName }}</p>
            <p class="text-xs text-slate-500">{{ child.age }} yrs</p>
          </div>
          <div class="flex gap-1">
            <button
              v-for="opt in statusOptions"
              :key="opt.value"
              @click="handleStatusChange(child.id, opt.value)"
              :class="{
                'ring-2 ring-offset-2': child.status === opt.value,
              }"
              class="rounded-full p-2 text-sm font-medium transition"
              :class="child.status === opt.value ? `bg-${opt.color}-600 text-white ring-${opt.color}-500` : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
            >
              {{ opt.icon }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
