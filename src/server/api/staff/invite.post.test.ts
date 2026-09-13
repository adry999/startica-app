import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted runs before any module imports — we use it to set H3/Nuxt
// globals so the server route file can load without the Nuxt build pipeline.
const { mockReadBody, mockUserClient, mockAdminClient } = vi.hoisted(() => {
  const mockReadBody = vi.fn()
  const mockUserClient = { auth: { getUser: vi.fn() }, from: vi.fn() }
  const mockAdminClient = {
    from: vi.fn(),
    auth: { admin: { inviteUserByEmail: vi.fn(), createUser: vi.fn() } },
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

// mode: 'invite' — this file's pre-existing tests exercise the set-password-link
// email flow. Direct-mode (default) account creation has its own tests below.
const VALID_BODY = {
  email: 'new@example.com',
  fullName: 'Educator Nou',
  role: 'educator',
  kindergartenId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  mode: 'invite' as const,
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

// updateGroup: .update(...).eq(...).select(...).single()
function makeUpdateQuery(result: { data: unknown; error: unknown }) {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

// grantModule's insert branch: .insert(...).select(...).single()
function makeInsertSelectQuery(result: { data: unknown; error: unknown }) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
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
    mockAdminClient.from.mockReturnValue(makeQuery({ data: { role: 'educator', status: 'active' }, error: null }))

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 403 })
  })

  it('returns 403 when admin invites to a kindergarten they do not belong to', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'admin', status: 'active' }, error: null }))  // role check
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))               // membership → not a member

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 403 })
  })

  it('invites new user and inserts their profile when called by super_admin', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    const NEW_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null })) // role check
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // existing user → none
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // insert profile
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // user audit log
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // upsert membership
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // audit log

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
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null }))       // role check
      .mockReturnValueOnce(makeQuery({ data: { id: EXISTING_USER_ID, role: 'educator' }, error: null }))      // existing user → found (non-super_admin)
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                          // upsert membership
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                          // audit log

    const result = await ((handler as unknown) as RouteHandler)({})

    expect(result).toEqual({ success: true })
    expect(mockAdminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('returns 500 when inviteUserByEmail fails', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null })) // no existing user

    mockAdminClient.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: 'smtp_error' },
    })

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 500 })
  })

  it('returns 500 when profile insert fails', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    const NEW_USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                       // no existing user
      .mockReturnValueOnce(makeQuery({ data: null, error: { message: 'db_error' } }))   // profile insert fails

    mockAdminClient.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 500 })
  })

  it('returns 500 when membership upsert fails', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    const NEW_USER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                      // no existing user
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                      // profile insert ok
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                      // user audit log
      .mockReturnValueOnce(makeQuery({ data: null, error: { message: 'fk_error' } }))  // membership fails

    mockAdminClient.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 500 })
  })

  it('admin who belongs to the kindergarten can invite an educator', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    const NEW_USER_ID = '11111111-1111-4111-8111-111111111111'

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'admin', status: 'active' }, error: null }))         // caller role
      .mockReturnValueOnce(makeQuery({ data: { user_id: CALLER_ID }, error: null }))    // membership check → member
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                      // no existing user
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                      // profile insert
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                      // user audit log
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                      // membership upsert
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                      // audit log

    mockAdminClient.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    const result = await ((handler as unknown) as RouteHandler)({})
    expect(result).toEqual({ success: true })
  })

  it('returns 403 when admin tries to invite with role admin', async () => {
    mockReadBody.mockResolvedValue({ ...VALID_BODY, role: 'admin' })
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'admin', status: 'active' }, error: null }))   // caller profile
      .mockReturnValueOnce(makeQuery({ data: { user_id: CALLER_ID }, error: null }))                // membership → member

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 403 })
  })

  it('returns 403 when trying to add an existing super_admin to a kindergarten', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY)
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null }))  // caller is super_admin
      .mockReturnValueOnce(makeQuery({ data: { id: 'target-id', role: 'super_admin' }, error: null })) // target is also super_admin

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 403 })
    expect(mockAdminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('returns 403 when admin tries to re-add an existing admin user', async () => {
    mockReadBody.mockResolvedValue(VALID_BODY) // role: 'educator' in VALID_BODY
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'admin', status: 'active' }, error: null }))        // caller profile
      .mockReturnValueOnce(makeQuery({ data: { user_id: CALLER_ID }, error: null }))                     // membership → member
      // existing.role is 'admin' (not educator)
      .mockReturnValueOnce(makeQuery({ data: { id: 'target-admin', role: 'admin' }, error: null }))

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 403 })
    expect(mockAdminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('normalizes email to lowercase before existing-user lookup', async () => {
    mockReadBody.mockResolvedValue({ ...VALID_BODY, email: 'NEW@EXAMPLE.COM' })
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    const NEW_USER_ID = 'aaaaaaaa-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))  // no existing user
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))  // profile insert
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))  // user audit log
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))  // membership upsert
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))  // audit log

    mockAdminClient.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    const result = await ((handler as unknown) as RouteHandler)({})
    expect(result).toEqual({ success: true })
    // The invite should have been sent to the lowercased email
    expect(mockAdminClient.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'new@example.com',
      expect.any(Object),
    )
  })

  // ── mode: 'direct' (default) ────────────────────────────────────────────

  it('creates the user directly with a server-generated password and returns it once', async () => {
    mockReadBody.mockResolvedValue({ ...VALID_BODY, mode: 'direct' })
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    const NEW_USER_ID = '22222222-2222-4222-8222-222222222222'

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null })) // role check
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // no existing user
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // insert profile
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // user audit log
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // upsert membership
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))                    // audit log

    mockAdminClient.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    const result = await ((handler as unknown) as RouteHandler)({})

    expect(mockAdminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
    expect(mockAdminClient.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: VALID_BODY.email, email_confirm: true }),
    )
    expect(result).toMatchObject({ success: true, generatedPassword: expect.any(String) })
  })

  it('creates the user directly with the admin-provided password instead of generating one', async () => {
    mockReadBody.mockResolvedValue({ ...VALID_BODY, mode: 'direct', password: 'MyChosenPassw0rd!' })
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    const NEW_USER_ID = '33333333-3333-4333-8333-333333333333'

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))

    mockAdminClient.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    const result = await ((handler as unknown) as RouteHandler)({})

    expect(mockAdminClient.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'MyChosenPassw0rd!' }),
    )
    expect(result).toEqual({ success: true, generatedPassword: 'MyChosenPassw0rd!' })
  })

  it('returns 500 when createUser fails', async () => {
    mockReadBody.mockResolvedValue({ ...VALID_BODY, mode: 'direct' })
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))

    mockAdminClient.auth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'admin_api_error' },
    })

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 500 })
  })

  // ── group + module assignment ───────────────────────────────────────────

  it('assigns the group educator when groupId is provided for an educator', async () => {
    mockReadBody.mockResolvedValue({
      ...VALID_BODY,
      mode: 'direct',
      groupId: '44444444-4444-4444-8444-444444444444',
    })
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    const NEW_USER_ID = '55555555-5555-4555-8555-555555555555'

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { id: '44444444-4444-4444-8444-444444444444' }, error: null })) // live tenant group
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))

    mockUserClient.from.mockReturnValueOnce(
      makeUpdateQuery({ data: { id: '44444444-4444-4444-8444-444444444444' }, error: null }),
    )

    mockAdminClient.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    const result = await ((handler as unknown) as RouteHandler)({})
    expect(result).toMatchObject({ success: true })
    expect(mockUserClient.from).toHaveBeenCalledWith('groups')
  })

  it('rejects an admin assigning an educator to a group in another kindergarten before creating an account', async () => {
    mockReadBody.mockResolvedValue({
      ...VALID_BODY,
      mode: 'direct',
      groupId: '77777777-7777-4777-8777-777777777777',
    })
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'admin', status: 'active' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { user_id: CALLER_ID }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null })) // group query is tenant-scoped

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 404 })
    expect(mockAdminClient.auth.admin.createUser).not.toHaveBeenCalled()
    expect(mockAdminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('rejects a missing or soft-deleted group before creating an account', async () => {
    mockReadBody.mockResolvedValue({
      ...VALID_BODY,
      mode: 'direct',
      groupId: '88888888-8888-4888-8888-888888888888',
    })
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({ statusCode: 404 })
    expect(mockAdminClient.auth.admin.createUser).not.toHaveBeenCalled()
  })

  it('returns an error when the validated group assignment fails', async () => {
    const groupId = '99999999-9999-4999-8999-999999999999'
    mockReadBody.mockResolvedValue({ ...VALID_BODY, mode: 'direct', groupId })
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { id: groupId }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))

    mockUserClient.from.mockReturnValueOnce(
      makeUpdateQuery({ data: null, error: { message: 'rls_denied' } }),
    )
    mockAdminClient.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } },
      error: null,
    })

    await expect(((handler as unknown) as RouteHandler)({})).rejects.toMatchObject({
      statusCode: 500,
      message: 'group_assignment_failed',
    })
  })

  it('grants the requested module keys after creating the user', async () => {
    mockReadBody.mockResolvedValue({ ...VALID_BODY, mode: 'direct', moduleKeys: ['pool'] })
    mockUserClient.auth.getUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } })

    const NEW_USER_ID = '66666666-6666-4666-8666-666666666666'

    mockAdminClient.from
      .mockReturnValueOnce(makeQuery({ data: { role: 'super_admin', status: 'active' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      // grantModule: lookup existing grant (maybeSingle → none), then insert().select().single()
      .mockReturnValueOnce(makeQuery({ data: null, error: null }))
      .mockReturnValueOnce(makeInsertSelectQuery({ data: { id: 'grant-1' }, error: null }))

    mockAdminClient.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    const result = await ((handler as unknown) as RouteHandler)({})
    expect(result).toMatchObject({ success: true })
  })
})
