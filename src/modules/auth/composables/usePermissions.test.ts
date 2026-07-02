import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import { usePermissions } from './usePermissions'
import type { ModuleGrant } from '~/modules/auth/types/moduleAccess.types'

function setUserRole(role: 'super_admin' | 'admin' | 'educator') {
  const authStore = useAuthStore()
  authStore.user = { id: 'user-1', email: 'a@b.com', fullName: 'A B', role, avatarUrl: null, status: 'active' }
}

function setUser(role: 'super_admin' | 'admin' | 'educator', grants: ModuleGrant[] = []) {
  const authStore = useAuthStore()
  authStore.user = { id: 'user-1', email: 'a@b.com', fullName: 'A B', role, avatarUrl: null, status: 'active' }
  authStore.moduleGrants = grants
}

describe('usePermissions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('lets a super_admin create, read, and update a kindergarten but not delete', () => {
    setUserRole('super_admin')
    const { can } = usePermissions()

    expect(can('create', 'kindergarten')).toBe(true)
    expect(can('read', 'kindergarten')).toBe(true)
    expect(can('update', 'kindergarten')).toBe(true)
    expect(can('delete', 'kindergarten')).toBe(false)
  })

  it('denies all kindergarten permissions to an admin (kindergartens list is super_admin-only)', () => {
    setUserRole('admin')
    const { can } = usePermissions()

    expect(can('read', 'kindergarten')).toBe(false)
    expect(can('create', 'kindergarten')).toBe(false)
    expect(can('update', 'kindergarten')).toBe(false)
    expect(can('delete', 'kindergarten')).toBe(false)
  })

  it('denies everything when there is no logged-in user', () => {
    const { can } = usePermissions()

    expect(can('read', 'kindergarten')).toBe(false)
    expect(can('create', 'kindergarten')).toBe(false)
  })

  it('lets a super_admin do all staff actions', () => {
    setUserRole('super_admin')
    const { can } = usePermissions()

    expect(can('create', 'staff')).toBe(true)
    expect(can('read', 'staff')).toBe(true)
    expect(can('update', 'staff')).toBe(true)
    expect(can('delete', 'staff')).toBe(true)
  })

  it('lets an admin do all staff actions', () => {
    setUserRole('admin')
    const { can } = usePermissions()

    expect(can('create', 'staff')).toBe(true)
    expect(can('read', 'staff')).toBe(true)
    expect(can('update', 'staff')).toBe(true)
    expect(can('delete', 'staff')).toBe(true)
  })

  it('denies all staff actions for an educator', () => {
    setUserRole('educator')
    const { can } = usePermissions()

    expect(can('create', 'staff')).toBe(false)
    expect(can('read', 'staff')).toBe(false)
    expect(can('update', 'staff')).toBe(false)
    expect(can('delete', 'staff')).toBe(false)
  })

  it('lets only super_admin assign roles', () => {
    setUserRole('super_admin')
    const { can } = usePermissions()
    expect(can('assign-role', 'staff')).toBe(true)
  })

  it('denies role assignment for admin', () => {
    setUserRole('admin')
    const { can } = usePermissions()
    expect(can('assign-role', 'staff')).toBe(false)
  })

  it('denies role assignment for educator', () => {
    setUserRole('educator')
    const { can } = usePermissions()
    expect(can('assign-role', 'staff')).toBe(false)
  })
})

describe('usePermissions — pool/payroll', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('admin and super_admin can view pool regardless of grants', () => {
    setUser('admin')
    expect(usePermissions().can('view', 'pool', 'kg-1')).toBe(true)
    setUser('super_admin')
    expect(usePermissions().can('view', 'pool', 'kg-1')).toBe(true)
  })

  it('educator can view pool only for a kindergarten they hold a pool grant in', () => {
    setUser('educator', [{ kindergartenId: 'kg-1', moduleKey: 'pool' }])
    const { can } = usePermissions()
    expect(can('view', 'pool', 'kg-1')).toBe(true)
    expect(can('view', 'pool', 'kg-2')).toBe(false)
  })

  it('educator with no grants cannot view pool or payroll', () => {
    setUser('educator', [])
    const { can } = usePermissions()
    expect(can('view', 'pool', 'kg-1')).toBe(false)
    expect(can('view', 'payroll', 'kg-1')).toBe(false)
  })

  it('payrollScope returns all for admin/super_admin', () => {
    setUser('admin')
    expect(usePermissions().payrollScope('kg-1')).toBe('all')
    setUser('super_admin')
    expect(usePermissions().payrollScope('kg-1')).toBe('all')
  })

  it('payrollScope reflects the educator grant key', () => {
    setUser('educator', [{ kindergartenId: 'kg-1', moduleKey: 'payroll_own' }])
    expect(usePermissions().payrollScope('kg-1')).toBe('own')
    setUser('educator', [{ kindergartenId: 'kg-1', moduleKey: 'payroll_all' }])
    expect(usePermissions().payrollScope('kg-1')).toBe('all')
    setUser('educator', [])
    expect(usePermissions().payrollScope('kg-1')).toBe(null)
  })

  it('can(view, payroll) is true exactly when payrollScope is non-null', () => {
    setUser('educator', [{ kindergartenId: 'kg-1', moduleKey: 'payroll_all' }])
    expect(usePermissions().can('view', 'payroll', 'kg-1')).toBe(true)
    expect(usePermissions().can('view', 'payroll', 'kg-2')).toBe(false)
  })
})
