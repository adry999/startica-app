import { describe, expect, it } from 'vitest'
import type { ModuleGrant, UserRole } from '@shared/session/actor.types'
import {
  canActorManagePoolTrainer,
  isActionAllowed,
  resolvePayrollScope,
  type PermissionSubject,
} from './permission-policy'

function subject(role: UserRole | null, moduleGrants: ModuleGrant[] = [], actorId: string | null = 'user-1'): PermissionSubject {
  return { actorId: role ? actorId : null, role, moduleGrants }
}

describe('isActionAllowed', () => {
  it('denies every action to a subject without a role', () => {
    expect(isActionAllowed(subject(null), 'read', 'settings')).toBe(false)
    expect(isActionAllowed(subject(null), 'read', 'children')).toBe(false)
  })

  it('lets any signed-in role read children and groups but only administrators change them', () => {
    expect(isActionAllowed(subject('educator'), 'read', 'children')).toBe(true)
    expect(isActionAllowed(subject('educator'), 'update', 'groups')).toBe(false)
    expect(isActionAllowed(subject('admin'), 'update', 'groups')).toBe(true)
  })

  it('keeps financial resources away from educators', () => {
    for (const resource of ['billing', 'payments', 'expenses'] as const) {
      expect(isActionAllowed(subject('educator'), 'read', resource)).toBe(false)
      expect(isActionAllowed(subject('admin'), 'read', resource)).toBe(true)
    }
  })

  it('lets an educator mark attendance', () => {
    expect(isActionAllowed(subject('educator'), 'create', 'attendance')).toBe(true)
  })

  it('never allows deleting a kindergarten, even for a super admin', () => {
    expect(isActionAllowed(subject('super_admin'), 'delete', 'kindergarten')).toBe(false)
  })
})

describe('resolvePayrollScope', () => {
  it('prefers the broader payroll grant when an educator holds both', () => {
    const grants: ModuleGrant[] = [
      { kindergartenId: 'kg-1', moduleKey: 'payroll_own' },
      { kindergartenId: 'kg-1', moduleKey: 'payroll_all' },
    ]

    expect(resolvePayrollScope(subject('educator', grants), 'kg-1')).toBe('all')
  })
})

describe('canActorManagePoolTrainer', () => {
  it('denies an educator whose pool grant belongs to another trainer id', () => {
    const grants: ModuleGrant[] = [{ kindergartenId: 'kg-1', moduleKey: 'pool' }]

    expect(canActorManagePoolTrainer(subject('educator', grants, 'user-1'), 'kg-1', 'user-2')).toBe(false)
  })
})
