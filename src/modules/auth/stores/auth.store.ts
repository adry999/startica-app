import { defineStore, getActivePinia, type Pinia } from 'pinia'
import { resetSessionStores } from '~/core/auth/session-reset'
import { useSupabaseClient } from '~/core/supabase/client'
import type { Database } from '~/core/supabase/types'
import { useActorStore } from '@shared/session/actor.store'
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
    loading: false,
    error: null as string | null,
    isPasswordRecovery: false,
    sessionVersion: 0,
    isAuthOperation: false,
  }),

  // Identity and grants live in the shared actor store; these read-only views keep
  // the auth module's own pages, middleware and plugins unchanged.
  getters: {
    user: (): AuthUser | null => useActorStore().actor,
    moduleGrants: (): ModuleGrant[] => useActorStore().moduleGrants,
    isAuthenticated: (): boolean => useActorStore().isSignedIn,
  },

  actions: {
    async login(email: string, password: string) {
      this.loading = true
      this.error = null
      this.isAuthOperation = true
      const client = useSupabaseClient()
      const pinia = getActivePinia() ?? undefined
      const actorStore = useActorStore()
      let sessionVersion = this.sessionVersion

      try {
        const signInResult = await authService.signInWithPassword(client, email, password)
        if (sessionVersion !== this.sessionVersion) return false
        if (!signInResult.success) {
          this.loading = false
          this.error = signInResult.error
          return false
        }

        // A different user can sign in without a page reload (for example after
        // an expired session). Remove every tenant-scoped cache before loading
        // their profile.
        if (actorStore.actorId && actorStore.actorId !== signInResult.data.userId) {
          this.clearSessionState({ preserveAuthOperation: true, pinia })
          sessionVersion = this.sessionVersion
        }

        const profileResult = await authService.fetchCurrentUserProfile(client, signInResult.data.userId)
        if (sessionVersion !== this.sessionVersion) return false
        if (!profileResult.success) {
          // Roll back an authenticated session without a usable profile.
          try {
            await authService.signOut(client)
          } catch {
            // Local state is still cleared when remote sign-out fails.
          }
          this.clearSessionState({ preserveAuthOperation: true, pinia })
          this.error = profileResult.error
          return false
        }

        this.loading = false
        actorStore.setActor(toAuthUser(profileResult.data))
        await this.loadModuleGrants(profileResult.data.id, client, sessionVersion)
        return sessionVersion === this.sessionVersion
      } catch (error) {
        if (sessionVersion === this.sessionVersion) {
          this.clearSessionState({ preserveAuthOperation: true, pinia })
          this.error = error instanceof Error ? error.message : 'login_failed'
        }
        return false
      } finally {
        this.loading = false
        this.isAuthOperation = false
      }
    },

    async logout() {
      const client = useSupabaseClient()
      const pinia = getActivePinia() ?? undefined
      this.isAuthOperation = true
      try {
        const result = await authService.signOut(client)
        return result.success
      } catch {
        return false
      } finally {
        // Clear local data even if Supabase cannot confirm the remote sign-out.
        this.clearSessionState({ preserveAuthOperation: true, pinia })
        this.isAuthOperation = false
      }
    },

    clearSessionState({
      preserveAuthOperation = false,
      pinia,
    }: { preserveAuthOperation?: boolean, pinia?: Pinia } = {}) {
      resetSessionStores(pinia)
      if (import.meta.client) clearNuxtData()
      useActorStore(pinia).clear()
      this.loading = false
      this.error = null
      this.isPasswordRecovery = false
      this.sessionVersion += 1
      if (!preserveAuthOperation) this.isAuthOperation = false
    },

    async fetchCurrentUser() {
      const client = useSupabaseClient()
      const pinia = getActivePinia() ?? undefined
      const actorStore = useActorStore()
      const sessionVersion = this.sessionVersion
      const userId = await authService.getCurrentUserId(client)

      if (sessionVersion !== this.sessionVersion) return

      if (!userId) {
        this.clearSessionState({ pinia })
        return
      }

      const profileResult = await authService.fetchCurrentUserProfile(client, userId)
      if (sessionVersion !== this.sessionVersion) return
      if (!profileResult.success) {
        this.clearSessionState({ pinia })
        this.error = profileResult.error
        return
      }

      if (actorStore.actorId && actorStore.actorId !== profileResult.data.id) {
        this.clearSessionState({ pinia })
      }

      actorStore.setActor(toAuthUser(profileResult.data))
      await this.loadModuleGrants(profileResult.data.id, client, this.sessionVersion)
    },

    // The client must be captured by the caller BEFORE any await: on SSR,
    // calling useSupabaseClient() after an await point loses the Nuxt
    // instance (useRequestEvent throws "composable called outside ...").
    async loadModuleGrants(
      userId: string,
      client: ReturnType<typeof useSupabaseClient> = useSupabaseClient(),
      sessionVersion?: number,
    ) {
      const actorStore = useActorStore()
      const requestVersion = sessionVersion ?? this.sessionVersion
      const result = await listUserModuleGrants(client, userId)
      if (requestVersion !== this.sessionVersion) return
      actorStore.setModuleGrants(result.success ? result.data : [])
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
