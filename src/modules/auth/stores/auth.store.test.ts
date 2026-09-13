import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, defineStore, setActivePinia } from 'pinia'

vi.mock('~/core/supabase/client', () => ({
  useSupabaseClient: () => ({}),
}))

vi.mock('../services/auth.service')

vi.mock('../services/moduleAccess.service', () => ({
  listUserModuleGrants: vi.fn(),
}))

import { useAuthStore } from './auth.store'
import { useTenantStore } from '~/modules/kindergartens/stores/tenant.store'
import * as authService from '../services/auth.service'
import { listUserModuleGrants } from '../services/moduleAccess.service'

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(listUserModuleGrants).mockResolvedValue({ success: true, data: [] })
  })

  it('sets the user and isAuthenticated on successful login', async () => {
    vi.mocked(authService.signInWithPassword).mockResolvedValue({
      success: true,
      data: { userId: 'user-1' },
    })
    vi.mocked(authService.fetchCurrentUserProfile).mockResolvedValue({
      success: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { id: 'user-1', email: 'a@b.com', full_name: 'A B', role: 'admin', avatar_url: null, status: 'active' } as any,
    })

    const store = useAuthStore()
    const result = await store.login('a@b.com', 'pw')

    expect(result).toBe(true)
    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.fullName).toBe('A B')
  })

  it('sets an error and stays unauthenticated on invalid credentials', async () => {
    vi.mocked(authService.signInWithPassword).mockResolvedValue({
      success: false,
      error: 'Invalid login credentials',
    })

    const store = useAuthStore()
    const result = await store.login('a@b.com', 'wrong')

    expect(result).toBe(false)
    expect(store.isAuthenticated).toBe(false)
    expect(store.error).toBe('Invalid login credentials')
  })

  it('clears the user on logout', async () => {
    vi.mocked(authService.signOut).mockResolvedValue({ success: true, data: null })

    const store = useAuthStore()
    store.user = { id: 'user-1', email: 'a@b.com', fullName: 'A B', role: 'admin', avatarUrl: null, status: 'active' }

    await store.logout()

    expect(store.user).toBeNull()
  })

  it('clears tenant and instantiated business stores even when sign-out fails', async () => {
    vi.mocked(authService.signOut).mockResolvedValue({ success: false, error: 'network_error' })
    const useBusinessStore = defineStore('session-test-business', {
      state: () => ({ items: [] as string[] }),
    })

    const store = useAuthStore()
    const tenantStore = useTenantStore()
    const businessStore = useBusinessStore()
    businessStore.items = ['child-a']
    store.user = { id: 'user-a', email: 'a@b.com', fullName: 'A B', role: 'admin', avatarUrl: null, status: 'active' }
    tenantStore.selectKindergarten('tenant-a')

    const result = await store.logout()

    expect(result).toBe(false)
    expect(store.user).toBeNull()
    expect(useTenantStore().selectedKindergartenId).toBeNull()
    expect(useBusinessStore().items).toEqual([])
  })

  it('clears local data and returns false when sign-out throws', async () => {
    vi.mocked(authService.signOut).mockRejectedValue(new Error('network_error'))
    const store = useAuthStore()
    store.user = { id: 'user-a', email: 'a@b.com', fullName: 'A B', role: 'admin', avatarUrl: null, status: 'active' }
    store.moduleGrants = [{ kindergartenId: 'tenant-a', moduleKey: 'pool' }]

    await expect(store.logout()).resolves.toBe(false)
    expect(store.user).toBeNull()
    expect(store.moduleGrants).toEqual([])
  })

  it('signs the session back out when the post-login profile fetch fails', async () => {
    vi.mocked(authService.signInWithPassword).mockResolvedValue({
      success: true,
      data: { userId: 'user-1' },
    })
    vi.mocked(authService.fetchCurrentUserProfile).mockResolvedValue({
      success: false,
      error: 'not_found',
    })
    vi.mocked(authService.signOut).mockResolvedValue({ success: true, data: null })

    const store = useAuthStore()
    const result = await store.login('a@b.com', 'pw')

    expect(result).toBe(false)
    expect(store.user).toBeNull()
    expect(authService.signOut).toHaveBeenCalledTimes(1)
  })

  it('captures the error and clears the user when fetchCurrentUser cannot load the profile', async () => {
    vi.mocked(authService.getCurrentUserId).mockResolvedValue('user-1')
    vi.mocked(authService.fetchCurrentUserProfile).mockResolvedValue({
      success: false,
      error: 'network_error',
    })

    const store = useAuthStore()
    await store.fetchCurrentUser()

    expect(store.user).toBeNull()
    expect(store.error).toBe('network_error')
  })

  it('clears tenant and business state before accepting a different authenticated user', async () => {
    vi.mocked(authService.getCurrentUserId).mockResolvedValue('user-b')
    vi.mocked(authService.fetchCurrentUserProfile).mockResolvedValue({
      success: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { id: 'user-b', email: 'b@b.com', full_name: 'B B', role: 'admin', avatar_url: null, status: 'active' } as any,
    })
    const useBusinessStore = defineStore('identity-test-business', {
      state: () => ({ items: [] as string[] }),
    })

    const store = useAuthStore()
    const tenantStore = useTenantStore()
    useBusinessStore().items = ['child-a']
    store.user = { id: 'user-a', email: 'a@b.com', fullName: 'A A', role: 'admin', avatarUrl: null, status: 'active' }
    tenantStore.selectKindergarten('tenant-a')

    await store.fetchCurrentUser()

    expect(store.user?.id).toBe('user-b')
    expect(useTenantStore().selectedKindergartenId).toBeNull()
    expect(useBusinessStore().items).toEqual([])
  })

  it('does not restore a profile that resolves after session state was cleared', async () => {
    vi.mocked(authService.getCurrentUserId).mockResolvedValue('user-a')
    let resolveProfile!: (value: Awaited<ReturnType<typeof authService.fetchCurrentUserProfile>>) => void
    vi.mocked(authService.fetchCurrentUserProfile).mockImplementation(() => new Promise((resolve) => {
      resolveProfile = resolve
    }))

    const store = useAuthStore()
    const pending = store.fetchCurrentUser()
    await Promise.resolve()
    store.clearSessionState()
    resolveProfile({
      success: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { id: 'user-a', email: 'a@b.com', full_name: 'A B', role: 'admin', avatar_url: null, status: 'active' } as any,
    })

    await pending
    expect(store.user).toBeNull()
    expect(store.moduleGrants).toEqual([])
  })

  it('defaults isPasswordRecovery to false and toggles it via setPasswordRecovery', () => {
    const store = useAuthStore()

    expect(store.isPasswordRecovery).toBe(false)

    store.setPasswordRecovery(true)
    expect(store.isPasswordRecovery).toBe(true)
  })
})

describe('auth.store module grants cache', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('populates moduleGrants via loadModuleGrants and clears them on logout', async () => {
    vi.mocked(listUserModuleGrants).mockResolvedValue({
      success: true,
      data: [{ kindergartenId: 'kg-1', moduleKey: 'pool' }],
    })
    vi.mocked(authService.signOut).mockResolvedValue({ success: true, data: null })

    const store = useAuthStore()
    await store.loadModuleGrants('user-1')

    expect(listUserModuleGrants).toHaveBeenCalledWith({}, 'user-1')
    expect(store.moduleGrants).toEqual([{ kindergartenId: 'kg-1', moduleKey: 'pool' }])

    await store.logout()
    expect(store.moduleGrants).toEqual([])
  })

  it('does not restore grants that resolve after a session reset', async () => {
    let resolveGrants!: (value: Awaited<ReturnType<typeof listUserModuleGrants>>) => void
    vi.mocked(listUserModuleGrants).mockImplementation(() => new Promise((resolve) => {
      resolveGrants = resolve
    }))

    const store = useAuthStore()
    const pending = store.loadModuleGrants('user-a')
    store.clearSessionState()
    resolveGrants({ success: true, data: [{ kindergartenId: 'tenant-a', moduleKey: 'pool' }] })

    await pending
    expect(store.moduleGrants).toEqual([])
  })
})
