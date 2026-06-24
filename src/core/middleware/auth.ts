import { resolveAuthRedirect } from './auth-redirect'

export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore()

  if (!authStore.user && !authStore.loading) {
    await authStore.fetchCurrentUser()
  }

  const redirect = resolveAuthRedirect({
    isAuthenticated: authStore.isAuthenticated,
    isPublic: to.meta.public === true,
    isGuestOnly: to.meta.guestOnly === true,
    fullPath: to.fullPath,
  })

  if (redirect) {
    return navigateTo(redirect)
  }
})
