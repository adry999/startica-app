import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import type { Database } from '~/core/supabase/types'
import * as authService from '../services/auth.service'
import type { AuthUser } from '../types/auth.types'

type UserRow = Database['public']['Tables']['users']['Row']

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    avatarUrl: row.avatar_url,
    status: row.status,
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthUser | null,
    loading: false,
    error: null as string | null,
  }),

  getters: {
    isAuthenticated: (state) => state.user !== null,
  },

  actions: {
    async login(email: string, password: string) {
      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const signInResult = await authService.signInWithPassword(client, email, password)
      if (!signInResult.success) {
        this.loading = false
        this.error = signInResult.error
        return false
      }

      const profileResult = await authService.fetchCurrentUserProfile(client, signInResult.data.userId)
      this.loading = false
      if (!profileResult.success) {
        this.error = profileResult.error
        return false
      }

      this.user = toAuthUser(profileResult.data)
      return true
    },

    async logout() {
      const client = useSupabaseClient()
      await authService.signOut(client)
      this.user = null
    },

    async fetchCurrentUser() {
      const client = useSupabaseClient()
      const userId = await authService.getCurrentUserId(client)

      if (!userId) {
        this.user = null
        return
      }

      const profileResult = await authService.fetchCurrentUserProfile(client, userId)
      this.user = profileResult.success ? toAuthUser(profileResult.data) : null
    },

    async requestPasswordReset(email: string) {
      this.loading = true
      this.error = null
      const client = useSupabaseClient()
      const redirectTo = `${window.location.origin}/reset-password`
      const result = await authService.requestPasswordReset(client, email, redirectTo)
      this.loading = false
      if (!result.success) this.error = result.error
      return result.success
    },

    async updatePassword(password: string) {
      this.loading = true
      this.error = null
      const client = useSupabaseClient()
      const result = await authService.updatePassword(client, password)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }
      return true
    },
  },
})
