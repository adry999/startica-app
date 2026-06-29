import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as guardiansSvc from '../services/guardians.service'
import type { Guardian, GuardianRelationship } from '../types/guardian.types'

export const useGuardiansStore = defineStore('guardians', {
  state: () => ({
    items:   [] as Guardian[],
    loading: false,
    error:   null as string | null,
  }),
  actions: {
    async fetchForChild(childId: string) {
      this.loading = true
      this.error   = null
      const result = await guardiansSvc.listGuardians(useSupabaseClient(), childId)
      this.loading = false
      if (!result.success) { this.error = result.error; return }
      this.items = result.data
    },
    async create(input: Parameters<typeof guardiansSvc.createGuardian>[1]) {
      const actorId = useAuthStore().user?.id ?? ''
      const result  = await guardiansSvc.createGuardian(useSupabaseClient(), input, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.items.push(result.data)
      this.items.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
      return true
    },
    async update(
      id: string,
      input: {
        firstName?: string; lastName?: string
        email?: string | null; phone?: string | null
        relationship?: GuardianRelationship; isPrimary?: boolean; notes?: string | null
      },
    ) {
      const actorId = useAuthStore().user?.id ?? ''
      const result  = await guardiansSvc.updateGuardian(useSupabaseClient(), id, input, actorId)
      if (!result.success) { this.error = result.error; return false }
      const idx = this.items.findIndex(g => g.id === id)
      if (idx !== -1) this.items[idx] = result.data
      return true
    },
    async remove(id: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result  = await guardiansSvc.removeGuardian(useSupabaseClient(), id, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.items = this.items.filter(g => g.id !== id)
      return true
    },
  },
})
