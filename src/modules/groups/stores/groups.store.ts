import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as groupsService from '../services/groups.service'
import type { Group } from '../types/groups.types'

export const useGroupsStore = defineStore('groups', {
  state: () => ({
    items: [] as Group[],
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async fetchAll(kindergartenId: string) {
      this.loading = true
      this.error = null
      const result = await groupsService.listGroups(useSupabaseClient(), kindergartenId)
      this.loading = false
      if (!result.success) { this.error = result.error; return }
      this.items = result.data
    },
    async fetchById(id: string) {
      this.loading = true
      this.error = null
      const result = await groupsService.getGroup(useSupabaseClient(), id)
      this.loading = false
      if (!result.success) { this.error = result.error; return null }
      const existing = this.items.findIndex(g => g.id === id)
      if (existing !== -1) this.items[existing] = result.data
      return result.data
    },
    async create(input: Parameters<typeof groupsService.createGroup>[1]) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await groupsService.createGroup(useSupabaseClient(), input, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.items.unshift(result.data)
      return true
    },
    async update(id: string, input: Parameters<typeof groupsService.updateGroup>[2]) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await groupsService.updateGroup(useSupabaseClient(), id, input, actorId)
      if (!result.success) { this.error = result.error; return false }
      const idx = this.items.findIndex(g => g.id === id)
      if (idx !== -1) {
        // Preserve childrenCount — updateGroup does not re-fetch it
        this.items[idx] = { ...result.data, childrenCount: this.items[idx]!.childrenCount }
      }
      return true
    },
    async archive(id: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await groupsService.archiveGroup(useSupabaseClient(), id, actorId)
      if (!result.success) { this.error = result.error; return false }
      const idx = this.items.findIndex(g => g.id === id)
      if (idx !== -1) this.items[idx]!.status = 'archived'
      return true
    },
    async restore(id: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await groupsService.restoreGroup(useSupabaseClient(), id, actorId)
      if (!result.success) { this.error = result.error; return false }
      const idx = this.items.findIndex(g => g.id === id)
      if (idx !== -1) this.items[idx]!.status = 'active'
      return true
    },
  },
})
