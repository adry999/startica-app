/**
 * Canonical definition of which roles are excluded from staff counts and lists.
 * super_admin is a platform-level role that does not belong to a kindergarten's staff roster.
 *
 * Both staff.service.ts (list) and dashboard.service.ts (count) must exclude this role.
 * If a new excluded role is ever added (e.g. 'system'), update only this constant.
 */
export const STAFF_EXCLUDED_ROLES = ['super_admin'] as const

export type StaffExcludedRole = (typeof STAFF_EXCLUDED_ROLES)[number]
