import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { authStore, client, callbacks } = vi.hoisted(() => ({
  authStore: {
    user: { id: 'user-a' }, isAuthOperation: false,
    clearSessionState: vi.fn(), setPasswordRecovery: vi.fn(),
  },
  client: { auth: { onAuthStateChange: vi.fn() } },
  callbacks: {} as { auth?: (event: string, session: { user: { id: string } } | null) => void },
}))
vi.mock('~/core/supabase/client', () => ({ useSupabaseClient: () => client }))

describe('auth state synchronization', () => {
  const replace = vi.fn()
  const clearCache = vi.fn()

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    authStore.user = { id: 'user-a' }
    authStore.isAuthOperation = false
    vi.stubGlobal('window', { location: { replace } })
    vi.stubGlobal('defineNuxtPlugin', (callback: () => void) => callback)
    vi.stubGlobal('useAuthStore', () => authStore)
    vi.stubGlobal('clearNuxtData', clearCache)
    client.auth.onAuthStateChange.mockImplementation(callback => { callbacks.auth = callback })
    const { default: plugin } = await import('./auth-state.client')
    ;(plugin as unknown as () => void)()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('leaves mounted authenticated pages after an external sign out', () => {
    callbacks.auth?.('SIGNED_OUT', null)
    expect(authStore.clearSessionState).toHaveBeenCalled()
    expect(clearCache).toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(replace).toHaveBeenCalledWith('/login')
  })

  it('lets an in-progress login own the identity reset without invalidating its version', () => {
    authStore.isAuthOperation = true
    callbacks.auth?.('SIGNED_IN', { user: { id: 'user-b' } })
    expect(clearCache).toHaveBeenCalled()
    expect(authStore.clearSessionState).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(replace).not.toHaveBeenCalled()
  })

  it('defers external account switches until the auth callback releases its lock', () => {
    callbacks.auth?.('SIGNED_IN', { user: { id: 'user-b' } })
    expect(authStore.clearSessionState).toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(replace).toHaveBeenCalledWith('/login')
  })
})
