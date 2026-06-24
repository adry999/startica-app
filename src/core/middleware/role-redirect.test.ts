import { describe, it, expect } from 'vitest'
import { resolveRoleRedirect } from './role-redirect'

describe('resolveRoleRedirect', () => {
  it('allows any role through when no roles are required', () => {
    expect(resolveRoleRedirect('educator', undefined)).toBeNull()
  })

  it('allows a user whose role is in the allowed list', () => {
    expect(resolveRoleRedirect('admin', ['admin', 'super_admin'])).toBeNull()
  })

  it('redirects a user whose role is not in the allowed list', () => {
    expect(resolveRoleRedirect('educator', ['admin', 'super_admin'])).toBe('/')
  })

  it('redirects when there is no user at all', () => {
    expect(resolveRoleRedirect(null, ['admin'])).toBe('/')
  })
})
