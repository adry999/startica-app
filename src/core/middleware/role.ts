import { resolveRoleRedirect } from './role-redirect'

export default defineNuxtRouteMiddleware((to) => {
  const actorStore = useActorStore()
  const redirect = resolveRoleRedirect(actorStore.role, to.meta.roles as string[] | undefined)

  if (redirect) {
    return navigateTo(redirect)
  }
})
