import { computed } from 'vue'
import { useAuthStore } from '../stores/auth.store'

export function useAuth() {
  const store = useAuthStore()

  return {
    user: computed(() => store.user),
    isAuthenticated: computed(() => store.isAuthenticated),
    loading: computed(() => store.loading),
    error: computed(() => store.error),
    login: (email: string, password: string) => store.login(email, password),
    logout: () => store.logout(),
    requestPasswordReset: (email: string) => store.requestPasswordReset(email),
    updatePassword: (password: string) => store.updatePassword(password),
  }
}
