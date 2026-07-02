import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import type { Database } from '~/core/supabase/types'
import * as authService from '../services/auth.service'
import { listUserModuleGrants } from '../services/moduleAccess.service'
import type { AuthUser } from '../types/auth.types'
import type { ModuleGrant } from '../types/moduleAccess.types'

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
    isPasswordRecovery: false,
    moduleGrants: [] as ModuleGrant[],
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
      if (!profileResult.success) {
        // A live Supabase session with no usable profile (e.g. the user was
        // soft-deleted/deactivated after they last set their password) must
        // not be left dangling — roll it back so the browser holds no
        // authenticated session the app itself doesn't recognize.
        await authService.signOut(client)
        this.loading = false
        this.error = profileResult.error
        return false
      }

      this.loading = false
      this.user = toAuthUser(profileResult.data)
      await this.loadModuleGrants(profileResult.data.id)
      return true
    },

    async logout() {
      const client = useSupabaseClient()
      await authService.signOut(client)
      this.user = null
      this.moduleGrants = []
    },

    async fetchCurrentUser() {
      const client = useSupabaseClient()
      const userId = await authService.getCurrentUserId(client)

      if (!userId) {
        this.user = null
        return
      }

      const profileResult = await authService.fetchCurrentUserProfile(client, userId)
      if (!profileResult.success) {
        this.error = profileResult.error
        this.user = null
        return
      }

      this.user = toAuthUser(profileResult.data)
      await this.loadModuleGrants(profileResult.data.id)
    },

    async loadModuleGrants(userId: string) {
      const client = useSupabaseClient()
      const result = await listUserModuleGrants(client, userId)
      this.moduleGrants = result.success ? result.data : []
    },

    setPasswordRecovery(value: boolean) {
      this.isPasswordRecovery = value
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
