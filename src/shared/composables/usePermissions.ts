import { useAuthStore } from '~/modules/auth/stores/auth.store'

export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'assign-role'
export type PermissionResource = 'kindergarten' | 'staff'

export function usePermissions() {
  const authStore = useAuthStore()

  function can(action: PermissionAction, resource: PermissionResource, _target?: unknown): boolean {
    const role = authStore.user?.role
    if (!role) return false

    if (resource === 'kindergarten') {
      // Kindergarten module (list, create, edit) is super_admin only.
      // 'read' is intentionally super_admin-only — admins access their kindergarten
      // via the tenant selector, not the /kindergartens management page.
      if (action === 'delete') return false
      return role === 'super_admin'
    }

    if (resource === 'staff') {
      // Only super_admin may assign roles (promote/demote between admin/educator).
      if (action === 'assign-role') return role === 'super_admin'
      return role === 'super_admin' || role === 'admin'
    }

    return false
  }

  return { can }
}
