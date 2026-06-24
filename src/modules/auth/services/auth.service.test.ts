import { describe, it, expect, vi } from 'vitest'
import {
  signInWithPassword,
  signOut,
  requestPasswordReset,
  updatePassword,
  fetchCurrentUserProfile,
  getCurrentUserId,
} from './auth.service'

function createMockClient(overrides: { auth?: Record<string, unknown> } = {}) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      ...overrides.auth,
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'user-1',
              email: 'a@b.com',
              full_name: 'A B',
              role: 'admin',
              avatar_url: null,
              status: 'active',
            },
            error: null,
          }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('signInWithPassword', () => {
  it('returns success with the user id on valid credentials', async () => {
    const client = createMockClient()
    const result = await signInWithPassword(client, 'a@b.com', 'pw')
    expect(result).toEqual({ success: true, data: { userId: 'user-1' } })
  })

  it('returns failure when Supabase returns an error', async () => {
    const client = createMockClient({
      auth: {
        signInWithPassword: vi
          .fn()
          .mockResolvedValue({ data: { user: null }, error: { message: 'Invalid login credentials' } }),
      },
    })
    const result = await signInWithPassword(client, 'a@b.com', 'wrong')
    expect(result).toEqual({ success: false, error: 'Invalid login credentials' })
  })
})

describe('signOut', () => {
  it('returns success when Supabase signs out cleanly', async () => {
    const client = createMockClient()
    expect(await signOut(client)).toEqual({ success: true, data: null })
  })
})

describe('requestPasswordReset', () => {
  it('calls resetPasswordForEmail with the redirect URL and returns success', async () => {
    const client = createMockClient()
    const result = await requestPasswordReset(client, 'a@b.com', 'http://localhost:3000/reset-password')
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', {
      redirectTo: 'http://localhost:3000/reset-password',
    })
    expect(result).toEqual({ success: true, data: null })
  })
})

describe('updatePassword', () => {
  it('returns success when Supabase updates the password', async () => {
    const client = createMockClient()
    expect(await updatePassword(client, 'newpass1')).toEqual({ success: true, data: null })
  })
})

describe('fetchCurrentUserProfile', () => {
  it('returns the matching public.users row', async () => {
    const client = createMockClient()
    const result = await fetchCurrentUserProfile(client, 'user-1')
    expect(result.success).toBe(true)
  })
})

describe('getCurrentUserId', () => {
  it('returns the user id when a session exists', async () => {
    const client = createMockClient({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    })
    expect(await getCurrentUserId(client)).toBe('user-1')
  })

  it('returns null when there is no session', async () => {
    const client = createMockClient({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    })
    expect(await getCurrentUserId(client)).toBeNull()
  })
})
