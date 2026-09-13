import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useActorStore } from '@shared/session/actor.store'
import type { ModuleGrant } from '@shared/session/actor.types'
import { usePermissions } from './usePermissions'

function setUserRole(role: 'super_admin' | 'admin' | 'educator') {
  useActorStore().setActor({ id: 'user-1', email: 'a@b.com', fullName: 'A B', role, avatarUrl: null, status: 'active' })
}

function setUser(role: 'super_admin' | 'admin' | 'educator', grants: ModuleGrant[] = []) {
  const actorStore = useActorStore()
  actorStore.setActor({ id: 'user-1', email: 'a@b.com', fullName: 'A B', role, avatarUrl: null, status: 'active' })
  actorStore.setModuleGrants(grants)
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

  // Single-kindergarten mode removed the 'ALL' selection, so an omitted id is
  // now the only "any kindergarten" form; a supplied id is always scoped.
  it('educator grant matches any kindergarten when the id is omitted', () => {
    setUser('educator', [{ kindergartenId: 'kg-2', moduleKey: 'pool' }])
    const { can } = usePermissions()
    expect(can('view', 'pool')).toBe(true)
    expect(can('view', 'pool', 'kg-2')).toBe(true)
    expect(can('view', 'pool', 'kg-1')).toBe(false)
  })

  it('payrollScope matches any kindergarten when the id is omitted', () => {
    setUser('educator', [{ kindergartenId: 'kg-2', moduleKey: 'payroll_own' }])
    expect(usePermissions().payrollScope()).toBe('own')
    expect(usePermissions().payrollScope('kg-2')).toBe('own')
    expect(usePermissions().payrollScope('kg-1')).toBeNull()
  })

  it('canManagePoolTrainer: admin and super_admin bypass the trainer-identity check', () => {
    setUserRole('admin')
    expect(usePermissions().canManagePoolTrainer('kg-1', 'someone-else')).toBe(true)
    setUserRole('super_admin')
    expect(usePermissions().canManagePoolTrainer('kg-1', 'someone-else')).toBe(true)
  })

  it('canManagePoolTrainer: educator with a pool grant manages only their own schedule', () => {
    setUser('educator', [{ kindergartenId: 'kg-1', moduleKey: 'pool' }])
    const { canManagePoolTrainer } = usePermissions()
    expect(canManagePoolTrainer('kg-1', 'user-1')).toBe(true)
    expect(canManagePoolTrainer('kg-1', 'other-user')).toBe(false)
  })

  it('canManagePoolTrainer: educator without a pool grant is denied even for their own id', () => {
    setUser('educator', [])
    expect(usePermissions().canManagePoolTrainer('kg-1', 'user-1')).toBe(false)
  })

  it('canManagePoolTrainer: grant on another kindergarten does not carry over', () => {
    setUser('educator', [{ kindergartenId: 'kg-2', moduleKey: 'pool' }])
    expect(usePermissions().canManagePoolTrainer('kg-1', 'user-1')).toBe(false)
  })

  it('canManagePoolTrainer: denied when no user is logged in', () => {
    expect(usePermissions().canManagePoolTrainer('kg-1', 'user-1')).toBe(false)
  })
})
