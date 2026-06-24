import { resolveRoleRedirect } from './role-redirect'

export default defineNuxtRouteMiddleware((to) => {
  const authStore = useAuthStore()
  const redirect = resolveRoleRedirect(authStore.user?.role ?? null, to.meta.roles as string[] | undefined)

  if (redirect) {
    return navigateTo(redirect)
  }
})
