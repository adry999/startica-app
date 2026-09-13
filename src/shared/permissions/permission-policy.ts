import type { ModuleGrant, ModuleKey, UserRole } from '@shared/session/actor.types'

export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'assign-role' | 'view'
export type PermissionResource = 'kindergarten' | 'staff' | 'children' | 'groups' | 'settings' | 'attendance' | 'pool' | 'payroll' | 'billing' | 'payments' | 'expenses'
export type PayrollScope = 'all' | 'own'

// What the policy needs to know about who is asking. Pure input, so each rule is testable
// without a store and a future PARENT role only adds rules here.
export interface PermissionSubject {
  actorId: string | null
  role: UserRole | null
  moduleGrants: ModuleGrant[]
}

// True when the subject holds a live grant for one of `keys`; an omitted kindergarten matches any.
function hasGrant(subject: PermissionSubject, kindergartenId: string | undefined, keys: ModuleKey[]): boolean {
  return subject.moduleGrants.some(grant =>
    keys.includes(grant.moduleKey) && (!kindergartenId || grant.kindergartenId === kindergartenId))
}

function isAdministrator(role: UserRole | null): boolean {
  return role === 'super_admin' || role === 'admin'
}

// Trainer self-service: an educator with a live `pool` grant may manage only their own
// availability, patterns and sessions; Admin/Super Admin manage any trainer in their
// kindergartens (RLS enforces the same rule server-side).
export function canActorManagePoolTrainer(subject: PermissionSubject, kindergartenId: string, trainerUserId: string): boolean {
  if (!subject.role) return false
  if (isAdministrator(subject.role)) return true
  if (subject.role !== 'educator') return false
  return subject.actorId === trainerUserId && hasGrant(subject, kindergartenId, ['pool'])
}

export function resolvePayrollScope(subject: PermissionSubject, kindergartenId?: string): PayrollScope | null {
  if (!subject.role) return null
  if (isAdministrator(subject.role)) return 'all'
  if (hasGrant(subject, kindergartenId, ['payroll_all'])) return 'all'
  if (hasGrant(subject, kindergartenId, ['payroll_own'])) return 'own'
  return null
}

export function isActionAllowed(
  subject: PermissionSubject,
  action: PermissionAction,
  resource: PermissionResource,
  target?: unknown,
): boolean {
  const { role } = subject
  if (!role) return false

  switch (resource) {
    case 'kindergarten':
      return action !== 'delete' && role === 'super_admin'
    case 'staff':
      return action === 'assign-role' ? role === 'super_admin' : isAdministrator(role)
    case 'children':
    case 'groups':
      return action === 'read' || isAdministrator(role)
    case 'settings':
      return true
    case 'attendance':
      // Educators mark attendance for their groups.
      return action === 'read' || isAdministrator(role) || role === 'educator'
    // Financial data is Admin / Super Admin only; RLS enforces the same rule
    // server-side (20260908000008_fix_financial_rls.sql).
    case 'billing':
    case 'payments':
    case 'expenses':
      return isAdministrator(role)
    case 'pool':
      return isAdministrator(role) || hasGrant(subject, target as string | undefined, ['pool'])
    case 'payroll':
      return resolvePayrollScope(subject, target as string | undefined) !== null
  }
}
