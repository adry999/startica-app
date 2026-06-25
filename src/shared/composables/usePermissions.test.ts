import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import { usePermissions } from './usePermissions'

function setUserRole(role: 'super_admin' | 'admin' | 'educator') {
  const authStore = useAuthStore()
  authStore.user = { id: 'user-1', email: 'a@b.com', fullName: 'A B', role, avatarUrl: null, status: 'active' }
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

  it('lets an admin read but not create/update/delete a kindergarten', () => {
    setUserRole('admin')
    const { can } = usePermissions()

    expect(can('read', 'kindergarten')).toBe(true)
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
})
