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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'attendance_request_failed'
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
    loadVersion: 0,
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
      const loadVersion = ++this.loadVersion
      this.loading = true
      this.error = null
      try {
        const result = await attendanceService.listByGroup(useSupabaseClient(), groupId, date)
        // A later group, date, or tenant selection supersedes this response.
        if (loadVersion !== this.loadVersion) return false
        if (!result.success) {
          this.error = result.error
          return false
        }
        this.records = result.data.map(toAttendanceRecord)
        return true
      } catch (error) {
        if (loadVersion === this.loadVersion) this.error = errorMessage(error)
        return false
      } finally {
        if (loadVersion === this.loadVersion) this.loading = false
      }
    },

    clear() {
      ++this.loadVersion
      this.records = []
      this.loading = false
      this.error = null
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

      const loadVersion = this.loadVersion
      this.loading = true
      this.error = null
      try {
        const result = await attendanceService.markAttendance(
          useSupabaseClient(), kindergartenId, childId, date, status, groupId, notes, userId,
        )
        if (loadVersion !== this.loadVersion) return false
        if (!result.success) {
          this.error = result.error
          return false
        }
        const existing = this.records.findIndex(r => r.id === result.data.id)
        if (existing !== -1) this.records[existing] = toAttendanceRecord(result.data)
        else this.records.push(toAttendanceRecord(result.data))
        return true
      } catch (error) {
        if (loadVersion === this.loadVersion) this.error = errorMessage(error)
        return false
      } finally {
        if (loadVersion === this.loadVersion) this.loading = false
      }
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

      const loadVersion = this.loadVersion
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
        if (loadVersion !== this.loadVersion) return false
        if (!result.success) {
          this.error = result.error
          return false
        }
        return await this.fetchByGroup(groupId, date)
      } catch (error) {
        if (loadVersion === this.loadVersion) this.error = errorMessage(error)
        return false
      } finally {
        if (loadVersion === this.loadVersion) this.loading = false
      }
    },
  },
})
