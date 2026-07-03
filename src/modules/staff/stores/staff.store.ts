import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as staffService from '../services/staff.service'
import type { UserRow } from '../services/staff.service'
import type { StaffMember } from '../types/staff.types'
import type { InviteStaffInput, UpdateStaffInput } from '~/shared/schemas/staff.schema'
import type { ModuleKey } from '~/modules/auth/types/moduleAccess.types'

function toStaffMember(row: UserRow): StaffMember {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role as StaffMember['role'],
    status: row.status as StaffMember['status'],
    avatarUrl: row.avatar_url ?? null,
  }
}

export const useStaffStore = defineStore('staff', {
  state: () => ({
    items: [] as StaffMember[],
    loading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchAll(kindergartenId: string) {
      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await staffService.listStaff(client, kindergartenId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        this.items = []
        return
      }

      this.items = result.data.map(toStaffMember)
    },

    async invite(input: InviteStaffInput) {
      this.loading = true
      this.error = null

      try {
        await $fetch('/api/staff/invite', { method: 'POST', body: input })
        await this.fetchAll(input.kindergartenId)
        this.loading = false
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'invite_failed'
        this.error = msg
        this.loading = false
        return false
      }
    },

    async updateProfile(userId: string, data: UpdateStaffInput) {
      const authStore = useAuthStore()
      const actorId = authStore.user?.id
      if (!actorId) return false

      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await staffService.updateStaffProfile(client, userId, data, actorId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }

      this.replaceItem(toStaffMember(result.data))
      return true
    },

    async setStatus(userId: string, status: 'active' | 'inactive') {
      const authStore = useAuthStore()
      const actorId = authStore.user?.id
      if (!actorId) return false

      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await staffService.setStaffStatus(client, userId, status, actorId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }

      this.replaceItem(toStaffMember(result.data))
      return true
    },

    async remove(userId: string, kindergartenId: string) {
      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await staffService.removeFromKindergarten(client, userId, kindergartenId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }

      this.items = this.items.filter((item) => item.id !== userId)
      return true
    },

    replaceItem(updated: StaffMember) {
      const index = this.items.findIndex((item) => item.id === updated.id)
      if (index === -1) return
      this.items[index] = updated
    },

    async fetchAssignedKindergartens(userId: string) {
      this.error = null
      const client = useSupabaseClient()
      const result = await staffService.listAssignedKindergartens(client, userId)
      if (!result.success) {
        this.error = result.error
        return []
      }
      return result.data
    },

    async fetchUserModules(userId: string, kindergartenId: string): Promise<ModuleKey[]> {
      this.error = null
      const client = useSupabaseClient()
      const result = await staffService.listUserModules(client, userId, kindergartenId)
      if (!result.success) {
        this.error = result.error
        return []
      }
      return result.data.map((row) => row.module_key as ModuleKey)
    },

    async saveModuleGrants(userId: string, kindergartenId: string, desiredKeys: ModuleKey[]): Promise<boolean> {
      const authStore = useAuthStore()
      const actorId = authStore.user?.id
      if (!actorId) return false

      const client = useSupabaseClient()
      this.loading = true
      this.error = null

      const currentResult = await staffService.listUserModules(client, userId, kindergartenId)
      if (!currentResult.success) {
        this.loading = false
        this.error = currentResult.error
        return false
      }
      const current = currentResult.data.map((row) => row.module_key as ModuleKey)

      const toAdd = desiredKeys.filter((k) => !current.includes(k))
      const toRemove = current.filter((k) => !desiredKeys.includes(k))

      for (const key of toAdd) {
        const r = await staffService.grantModule(client, userId, kindergartenId, key, actorId)
        if (!r.success) { this.loading = false; this.error = r.error; return false }
      }
      for (const key of toRemove) {
        const r = await staffService.revokeModule(client, userId, kindergartenId, key)
        if (!r.success) { this.loading = false; this.error = r.error; return false }
      }

      this.loading = false
      return true
    },
  },
})
