import { useAuthStore } from '~/modules/auth/stores/auth.store'

export type PermissionAction = 'create' | 'read' | 'update' | 'delete'
export type PermissionResource = 'kindergarten'

export function usePermissions() {
  const authStore = useAuthStore()

  function can(action: PermissionAction, resource: PermissionResource, _target?: unknown): boolean {
    const role = authStore.user?.role
    if (!role) return false

    if (resource === 'kindergarten') {
      if (action === 'read') return true
      return role === 'super_admin'
    }

    return false
  }

  return { can }
}
