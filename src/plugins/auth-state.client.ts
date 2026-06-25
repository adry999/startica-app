import { useSupabaseClient } from '~/core/supabase/client'

export default defineNuxtPlugin(() => {
  const client = useSupabaseClient()
  const authStore = useAuthStore()

  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      authStore.setPasswordRecovery(true)
    }
  })
})
