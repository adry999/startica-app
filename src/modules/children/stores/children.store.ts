import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as childrenService from '../services/children.service'
import type { Child } from '../types/children.types'
import type { Database } from '~/core/supabase/types'

type ChildStatus = Database['public']['Enums']['child_status']

export const useChildrenStore = defineStore('children', {
  state: () => ({
    items:   [] as Child[],
    loading: false,
    error:   null as string | null,
  }),
  actions: {
    async fetchAll(kindergartenId: string) {
      this.loading = true
      this.error = null
      const result = await childrenService.listChildren(useSupabaseClient(), kindergartenId)
      this.loading = false
      if (!result.success) { this.error = result.error; return }
      this.items = result.data
    },
    async create(input: Parameters<typeof childrenService.createChild>[1]) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await childrenService.createChild(useSupabaseClient(), input, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.items.unshift(result.data)
      return true
    },
    async update(id: string, input: Parameters<typeof childrenService.updateChild>[2]) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await childrenService.updateChild(useSupabaseClient(), id, input, actorId)
      if (!result.success) { this.error = result.error; return false }
      const idx = this.items.findIndex(c => c.id === id)
      if (idx !== -1) this.items[idx] = result.data
      return true
    },
    async setStatus(id: string, status: ChildStatus) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await childrenService.setChildStatus(useSupabaseClient(), id, status, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.items = this.items.filter(c => c.id !== id)
      return true
    },
  },
})
