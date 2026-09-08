import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useStoreAction } from '~/shared/composables/useStoreAction'
import * as staffService from '../services/staff.service'
import type { UserRow } from '../services/staff.service'
import type { StaffMember } from '../types/staff.types'
import type { InviteStaffInput, UpdateStaffInput } from '~/shared/schemas/staff.schema'

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
      const withLoading = useStoreAction(this)
      return withLoading(
        () => staffService.listStaff(useSupabaseClient(), kindergartenId),
        (data) => { this.items = data.map(toStaffMember) },
      )
    },

    async invite(input: InviteStaffInput) {
      this.loading = true
      this.error = null

      try {
        await $fetch('/api/staff/invite', { method: 'POST', body: input })
        await this.fetchAll(input.kindergartenId)
        return true
      } catch (err: unknown) {
        this.error = err instanceof Error ? err.message : 'invite_failed'
        return false
      } finally {
        this.loading = false
      }
    },

    async updateProfile(userId: string, data: UpdateStaffInput) {
      const withLoading = useStoreAction(this)
      return withLoading(
        () => staffService.updateStaffProfile(useSupabaseClient(), userId, data),
        (data) => { this.replaceItem(toStaffMember(data)) },
      )
    },

    async setStatus(userId: string, status: 'active' | 'inactive') {
      const withLoading = useStoreAction(this)
      return withLoading(
        () => staffService.setStaffStatus(useSupabaseClient(), userId, status),
        (data) => { this.replaceItem(toStaffMember(data)) },
      )
    },

    async remove(userId: string, kindergartenId: string) {
      const withLoading = useStoreAction(this)
      return withLoading(
        () => staffService.removeFromKindergarten(useSupabaseClient(), userId, kindergartenId),
        () => { this.items = this.items.filter((item) => item.id !== userId) },
      )
    },

    replaceItem(updated: StaffMember) {
      const index = this.items.findIndex((item) => item.id === updated.id)
      if (index === -1) return
      this.items[index] = updated
    },
  },
})
