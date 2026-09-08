import { useAuthStore } from '~/modules/auth/stores/auth.store'
import type { ModuleKey } from '~/modules/auth/types/moduleAccess.types'

export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'assign-role' | 'view'
export type PermissionResource = 'kindergarten' | 'staff' | 'children' | 'groups' | 'settings' | 'attendance' | 'pool' | 'payroll' | 'billing' | 'payments' | 'expenses'

export function usePermissions() {
  const authStore = useAuthStore()

  // True when the user holds a live grant for one of `keys` in the specified kindergarten.
  function hasGrant(kindergartenId: string | undefined, keys: ModuleKey[]): boolean {
    const grants = authStore.moduleGrants
    if (kindergartenId) {
      return grants.some((g) => g.kindergartenId === kindergartenId && keys.includes(g.moduleKey))
    }
    return grants.some((g) => keys.includes(g.moduleKey))
  }

  // Trainer self-service: an educator with a live `pool` grant may manage
  // only their own availability/patterns/sessions; Admin/Super Admin manage
  // any trainer in their kindergartens (RLS enforces the same rule server-side).
  function canManagePoolTrainer(kindergartenId: string, trainerUserId: string): boolean {
    const role = authStore.user?.role
    if (!role) return false
    if (role === 'super_admin' || role === 'admin') return true
    if (role !== 'educator') return false
    return authStore.user?.id === trainerUserId && hasGrant(kindergartenId, ['pool'])
  }

  function payrollScope(kindergartenId?: string): 'all' | 'own' | null {
    const role = authStore.user?.role
    if (!role) return null
    if (role === 'super_admin' || role === 'admin') return 'all'
    if (hasGrant(kindergartenId, ['payroll_all'])) return 'all'
    if (hasGrant(kindergartenId, ['payroll_own'])) return 'own'
    return null
  }

  function can(action: PermissionAction, resource: PermissionResource, target?: unknown): boolean {
    const role = authStore.user?.role
    if (!role) return false

    if (resource === 'kindergarten') {
      if (action === 'delete') return false
      return role === 'super_admin'
    }

    if (resource === 'staff') {
      if (action === 'assign-role') return role === 'super_admin'
      return role === 'super_admin' || role === 'admin'
    }

    if (resource === 'children') {
      if (action === 'read') return true
      return role === 'super_admin' || role === 'admin'
    }

    if (resource === 'groups') {
      if (action === 'read') return true
      return role === 'super_admin' || role === 'admin'
    }

    if (resource === 'settings') {
      return true // all authenticated users
    }

    if (resource === 'attendance') {
      // Educators can mark attendance for their groups
      if (action === 'read') return true
      return role === 'super_admin' || role === 'admin' || role === 'educator'
    }

    // Financial data (invoices, payments, expenses) is Admin / Super Admin
    // only — educators have no access to money. RLS enforces the same rule
    // server-side; see 20260908000008_fix_financial_rls.sql.
    if (resource === 'billing' || resource === 'payments' || resource === 'expenses') {
      return role === 'super_admin' || role === 'admin'
    }

    if (resource === 'pool') {
      if (role === 'super_admin' || role === 'admin') return true
      return hasGrant(target as string | undefined, ['pool'])
    }

    if (resource === 'payroll') {
      return payrollScope(target as string | undefined) !== null
    }

    return false
  }

  return { can, canManagePoolTrainer, payrollScope }
}
