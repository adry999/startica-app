import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useStoreAction } from '~/shared/composables/useStoreAction'
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
      const withLoading = useStoreAction(this)
      return withLoading(
        () => groupsService.listGroups(useSupabaseClient(), kindergartenId),
        (data) => { this.items = data },
      )
    },
    async fetchById(id: string) {
      this.loading = true
      this.error = null
      try {
        const result = await groupsService.getGroup(useSupabaseClient(), id)
        if (!result.success) {
          this.error = result.error
          return null
        }
        const existing = this.items.findIndex(g => g.id === id)
        if (existing !== -1) this.items[existing] = result.data
        return result.data
      } finally {
        this.loading = false
      }
    },
    async create(input: Parameters<typeof groupsService.createGroup>[1]) {
      const withLoading = useStoreAction(this)
      return withLoading(
        () => groupsService.createGroup(useSupabaseClient(), input),
        (data) => { this.items.unshift(data) },
      )
    },
    async update(id: string, input: Parameters<typeof groupsService.updateGroup>[2]) {
      const result = await groupsService.updateGroup(useSupabaseClient(), id, input)
      if (!result.success) {
        this.error = result.error
        return false
      }
      const idx = this.items.findIndex(g => g.id === id)
      if (idx !== -1) {
        this.items[idx] = { ...result.data, childrenCount: this.items[idx]!.childrenCount }
      }
      return true
    },
    async archive(id: string) {
      const result = await groupsService.archiveGroup(useSupabaseClient(), id)
      if (!result.success) {
        this.error = result.error
        return false
      }
      const idx = this.items.findIndex(g => g.id === id)
      if (idx !== -1) this.items[idx]!.status = 'archived'
      return true
    },
    async restore(id: string) {
      const result = await groupsService.restoreGroup(useSupabaseClient(), id)
      if (!result.success) {
        this.error = result.error
        return false
      }
      const idx = this.items.findIndex(g => g.id === id)
      if (idx !== -1) this.items[idx]!.status = 'active'
      return true
    },
  },
})
