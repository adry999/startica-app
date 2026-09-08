import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useStoreAction } from '~/shared/composables/useStoreAction'
import * as dashboardService from '../services/dashboard.service'
import type { DashboardStats, GroupSummary, ActivityEntry, StaffDuty } from '../types/dashboard.types'

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    stats: null as DashboardStats | null,
    groups: [] as GroupSummary[],
    activity: [] as ActivityEntry[],
    staffOnDuty: [] as StaffDuty[],
    loading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchAll(kindergartenId: string) {
      this.loading = true
      this.error = null
      this.stats = null
      this.groups = []
      this.activity = []
      this.staffOnDuty = []
      const client = useSupabaseClient()

      try {
        const [statsResult, groupsResult, activityResult, staffResult] = await Promise.all([
          dashboardService.fetchStats(client, kindergartenId),
          dashboardService.fetchActiveGroups(client, kindergartenId),
          dashboardService.fetchRecentActivity(client, kindergartenId),
          dashboardService.fetchStaffOnDuty(client, kindergartenId),
        ])

        if (!statsResult.success) {
          this.error = statsResult.error
          return
        }
        if (!groupsResult.success) {
          this.error = groupsResult.error
          return
        }
        if (!activityResult.success) {
          this.error = activityResult.error
          return
        }
        if (!staffResult.success) {
          this.error = staffResult.error
          return
        }

        this.stats = statsResult.data
        this.groups = groupsResult.data
        this.activity = activityResult.data
        this.staffOnDuty = staffResult.data
      } finally {
        this.loading = false
      }
    },

    async fetchAuditLog(kindergartenId: string) {
      const withLoading = useStoreAction(this)
      return withLoading(
        () => dashboardService.fetchActivity(useSupabaseClient(), kindergartenId, 100),
        (data) => { this.activity = data },
      )
    },
  },
})
