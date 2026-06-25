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
      // Kindergartens are never hard-deleted (no DELETE RLS policy, no delete
      // service method, no delete UI). Returning false keeps can() honest and
      // prevents future contributors from accidentally wiring a delete button
      // off this check against an operation the DB will always reject.
      if (action === 'delete') return false
      return role === 'super_admin'
    }

    return false
  }

  return { can }
}
