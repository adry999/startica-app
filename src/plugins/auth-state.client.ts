import { useSupabaseClient } from '~/core/supabase/client'

export default defineNuxtPlugin(() => {
  const client = useSupabaseClient()
  const authStore = useAuthStore()

  function leaveAuthenticatedPage() {
    // Defer until Supabase releases its auth lock. Reloading also discards
    // mounted components that still hold disposed store references.
    setTimeout(() => window.location.replace('/login'), 0)
  }

  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      authStore.setPasswordRecovery(true)
      return
    }

    // Supabase invokes this callback while holding its auth lock. Keep it
    // synchronous: fetching a profile or calling signOut here can deadlock.
    if (event === 'SIGNED_OUT') {
      const isOwnLogout = authStore.isAuthOperation
      authStore.clearSessionState({ preserveAuthOperation: isOwnLogout })
      clearNuxtData()
      if (!isOwnLogout) leaveAuthenticatedPage()
      return
    }

    if (session?.user.id && authStore.user?.id && authStore.user.id !== session.user.id) {
      const isOwnAuthentication = authStore.isAuthOperation
      clearNuxtData()
      if (!isOwnAuthentication) {
        authStore.clearSessionState()
        leaveAuthenticatedPage()
      }
    }
  })
})
