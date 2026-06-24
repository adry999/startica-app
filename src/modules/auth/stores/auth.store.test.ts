import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('~/core/supabase/client', () => ({
  useSupabaseClient: () => ({}),
}))

vi.mock('../services/auth.service')

import { useAuthStore } from './auth.store'
import * as authService from '../services/auth.service'

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
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
})
