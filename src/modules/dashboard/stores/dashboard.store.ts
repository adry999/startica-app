import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import * as dashboardService from '../services/dashboard.service'
import type { DashboardStats, GroupSummary } from '../types/dashboard.types'

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    stats: null as DashboardStats | null,
    groups: [] as GroupSummary[],
    loading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchAll(kindergartenId: string) {
      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const [statsResult, groupsResult] = await Promise.all([
        dashboardService.fetchStats(client, kindergartenId),
        dashboardService.fetchActiveGroups(client, kindergartenId),
      ])

      this.loading = false

      if (!statsResult.success) { this.error = statsResult.error; return }
      if (!groupsResult.success) { this.error = groupsResult.error; return }

      this.stats = statsResult.data
      this.groups = groupsResult.data
    },
  },
})
