import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useStoreAction } from '~/shared/composables/useStoreAction'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as attendanceService from '../services/attendance.service'
import type { AttendanceRow, AttendanceStatus } from '../services/attendance.service'

interface AttendanceRecord {
  id: string
  childId: string
  date: string
  status: AttendanceStatus
  markedBy: string
  notes: string | null
}

function toAttendanceRecord(row: AttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    childId: row.child_id,
    date: row.date,
    status: row.status,
    markedBy: row.marked_by,
    notes: row.notes,
  }
}

export const useAttendanceStore = defineStore('attendance', {
  state: () => ({
    records: [] as AttendanceRecord[],
    loading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchByDate(kindergartenId: string, date: string) {
      const withLoading = useStoreAction(this)
      return withLoading(
        () => attendanceService.listByDate(useSupabaseClient(), kindergartenId, date),
        (data) => { this.records = data.map(toAttendanceRecord) },
      )
    },

    async fetchByGroup(groupId: string, date: string) {
      const withLoading = useStoreAction(this)
      return withLoading(
        () => attendanceService.listByGroup(useSupabaseClient(), groupId, date),
        (data) => { this.records = data.map(toAttendanceRecord) },
      )
    },

    async markAttendance(
      kindergartenId: string,
      childId: string,
      date: string,
      status: AttendanceStatus,
      groupId: string | null = null,
      notes: string | null = null,
    ) {
      const authStore = useAuthStore()
      const userId = authStore.user?.id
      if (!userId) return false

      const withLoading = useStoreAction(this)
      return withLoading(
        () =>
          attendanceService.markAttendance(
            useSupabaseClient(),
            kindergartenId,
            childId,
            date,
            status,
            groupId,
            notes,
            userId,
          ),
        (data) => {
          const existing = this.records.findIndex(r => r.id === data.id)
          if (existing !== -1) {
            this.records[existing] = toAttendanceRecord(data)
          } else {
            this.records.push(toAttendanceRecord(data))
          }
        },
      )
    },

    async markGroupBulk(
      kindergartenId: string,
      groupId: string,
      date: string,
      childIds: string[],
      status: AttendanceStatus,
    ) {
      const authStore = useAuthStore()
      const userId = authStore.user?.id
      if (!userId) return false

      this.loading = true
      this.error = null
      try {
        const result = await attendanceService.markGroupAttendance(
          useSupabaseClient(),
          kindergartenId,
          groupId,
          date,
          childIds,
          status,
          userId,
        )
        if (!result.success) {
          this.error = result.error
          return false
        }
        await this.fetchByGroup(groupId, date)
        return true
      } finally {
        this.loading = false
      }
    },
  },
})
