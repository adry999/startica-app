import { describe, it, expect } from 'vitest'
import { resolveAuthRedirect } from './auth-redirect'

describe('resolveAuthRedirect', () => {
  it('allows authenticated users through to a protected route', () => {
    expect(
      resolveAuthRedirect({ isAuthenticated: true, isPublic: false, isGuestOnly: false, fullPath: '/' }),
    ).toBeNull()
  })

  it('redirects unauthenticated users to login with a redirect param', () => {
    expect(
      resolveAuthRedirect({ isAuthenticated: false, isPublic: false, isGuestOnly: false, fullPath: '/children' }),
    ).toBe('/login?redirect=%2Fchildren')
  })

  it('lets unauthenticated users reach public routes', () => {
    expect(
      resolveAuthRedirect({ isAuthenticated: false, isPublic: true, isGuestOnly: false, fullPath: '/login' }),
    ).toBeNull()
  })

  it('redirects authenticated users away from guest-only routes', () => {
    expect(
      resolveAuthRedirect({ isAuthenticated: true, isPublic: true, isGuestOnly: true, fullPath: '/login' }),
    ).toBe('/')
  })
})
