import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted runs before any module imports — we use it to set H3/Nuxt
// globals so the server route file can load without the Nuxt build pipeline.
const { mockReadBody, mockUserClient, mockAdminClient } = vi.hoisted(() => {
  const mockReadBody = vi.fn()
  const mockUserClient = { auth: { getUser: vi.fn() } }
  const mockAdminClient = {
    from: vi.fn(),
    auth: { admin: { inviteUserByEmail: vi.fn() } },
  }

  const g = globalThis as Record<string, unknown>
  g.defineEventHandler = (fn: unknown) => fn
  g.readBody = mockReadBody
  g.createError = (opts: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(opts.statusMessage), { statusCode: opts.statusCode })
  g.useRuntimeConfig = () => ({ public: { siteUrl: 'http://localhost:3000' } })

  return { mockReadBody, mockUserClient, mockAdminClient }
})

vi.mock('~/core/supabase/client', () => ({
  createSupabaseServerClient: () => mockUserClient,
  createSupabaseAdminClient: () => mockAdminClient,
}))

import handler from './invite.post'

type RouteHandler = (event: Record<string, unknown>) => Promise<unknown>

// ── helpers ────────────────────────────────────────────────────────────────

const VALID_BODY = {
  email: 'new@example.com',
  fullName: 'Educator Nou',
  role: 'educator',
  kindergartenId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
}

const CALLER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function makeQuery(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    insert: vi.fn().mockResolvedValue(result),
    upsert: vi.fn().mockResolvedValue(result),
  }
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('POST /api/staff/invite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when body fails schema validation', async () => {
    mockReadBody.mockResolvedValue({ email: 'not-an-email' })

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 400 })
  })

  it('returns 401 when caller is not authenticated', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: null } })

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 401 })
  })

  it('returns 403 when caller is an educator', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })
    mockAdminClient.from.mockReturnValue(makeQuery({ data: { role: 'educator' }, error: null }))

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 403 })
  })

  it('returns 403 when admin invites to a kindergarten they do not belong to', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'admin' }, error: null }))  // role check
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))               // membership → not a member

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 403 })
  })

  it('invites new user and inserts their profile when called by super_admin', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    const NEW_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin' }, error: null })) // role check
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // existing user → none
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // insert profile
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // upsert membership

    mockAdminClient.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    const result = await ((handler as unknown) as RouteHandler)({})

    expect(result).toEqual({ success: true })
    expect(mockAdminClient.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      VALID_BODY.email,
      expect.objectContaining({ redirectTo: 'http://localhost:3000/accept-invite' }),
    )
  })

  it('skips inviteUserByEmail and re-adds existing user to kindergarten', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    const EXISTING_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin' }, error: null }))       // role check
      .mockReturnValueOnce(makeQuery({ data: { id: EXISTING_USER_ID }, error: null }))      // existing user → found
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                          // upsert membership

    const result = await ((handler as unknown) as RouteHandler)({})

    expect(result).toEqual({ success: true })
    expect(mockAdminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })
})
