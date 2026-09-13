import { computed } from 'vue'
import { useAttendanceStore } from '../stores/attendance.store'
import type { AttendanceStatus } from '../services/attendance.service'

export function useAttendance() {
  const store = useAttendanceStore()

  return {
    records: computed(() => store.records),
    loading: computed(() => store.loading),
    error: computed(() => store.error),
    fetchByDate: (kindergartenId: string, date: string) =>
      store.fetchByDate(kindergartenId, date),
    fetchByGroup: (groupId: string, date: string) =>
      store.fetchByGroup(groupId, date),
    markAttendance: (
      kindergartenId: string,
      childId: string,
      date: string,
      status: AttendanceStatus,
      groupId?: string | null,
      notes?: string | null,
    ) => store.markAttendance(kindergartenId, childId, date, status, groupId, notes),
    markGroupBulk: (
      kindergartenId: string,
      groupId: string,
      date: string,
      childIds: string[],
      status: AttendanceStatus,
    ) => store.markGroupBulk(kindergartenId, groupId, date, childIds, status),
    clear: () => store.clear(),
  }
}
