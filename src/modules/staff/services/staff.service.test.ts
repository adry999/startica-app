import { describe, it, expect, vi } from 'vitest'
import {
  listStaff,
  updateStaffProfile,
  setStaffStatus,
  removeFromKindergarten,
  listUserModules,
  grantModule,
  revokeModule,
  listAssignedKindergartens,
  type UserModuleRow,
} from './staff.service'

const sampleRow = {
  id: 'user-2',
  email: 'maria@example.com',
  full_name: 'Maria Ionescu',
  role: 'admin' as const,
  status: 'active' as const,
  avatar_url: null,
  created_at: '2026-06-24T00:00:00Z',
  updated_at: '2026-06-24T00:00:00Z',
  created_by: 'user-1',
  updated_by: 'user-1',
  deleted_at: null,
}

let mockOrder: ReturnType<typeof vi.fn>
let mockNeq: ReturnType<typeof vi.fn>
let mockIs: ReturnType<typeof vi.fn>
let mockEq: ReturnType<typeof vi.fn>

let mockDeleteEq1: ReturnType<typeof vi.fn>
let mockDeleteEq2: ReturnType<typeof vi.fn>

function createMockClient(opts: {
  users?: Array<typeof sampleRow> | null
  queryError?: { message: string } | null
  mutationResult?: typeof sampleRow | null
  deleteError?: { message: string } | null
} = {}) {
  const {
    users = [sampleRow],
    queryError = null,
    mutationResult = sampleRow,
    deleteError = null,
  } = opts

  mockOrder = vi.fn().mockResolvedValue({ data: users, error: queryError })
  mockNeq = vi.fn().mockReturnValue({ order: mockOrder })
  mockIs = vi.fn().mockReturnValue({ neq: mockNeq })
  mockEq = vi.fn().mockReturnValue({ is: mockIs })

  mockDeleteEq2 = vi.fn().mockResolvedValue({ error: deleteError })
  mockDeleteEq1 = vi.fn().mockReturnValue({ eq: mockDeleteEq2 })

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnValue({ eq: mockEq }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mutationResult, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'user_kindergartens') {
        return {
          delete: vi.fn().mockReturnValue({ eq: mockDeleteEq1 }),
        }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('listStaff', () => {
  it('returns users for the given kindergarten via single join, excluding super_admins', async () => {
    const client = createMockClient()
    const result = await listStaff(client, 'kg-1')

    expect(result).toEqual({ success: true, data: [sampleRow] })
    expect(client.from).toHaveBeenCalledWith('users')
    expect(client.from).not.toHaveBeenCalledWith('user_kindergartens')
    expect(mockEq).toHaveBeenCalledWith('user_kindergartens.kindergarten_id', 'kg-1')
  })

  it('returns an empty array when no users match the kindergarten', async () => {
    const client = createMockClient({ users: [] })
    const result = await listStaff(client, 'kg-1')

    expect(result).toEqual({ success: true, data: [] })
  })

  it('filters out soft-deleted rows and super_admin accounts', async () => {
    const client = createMockClient()
    await listStaff(client, 'kg-1')

    expect(mockIs).toHaveBeenCalledWith('deleted_at', null)
    expect(mockNeq).toHaveBeenCalledWith('role', 'super_admin')
  })

  it('returns failure when the query errors', async () => {
    const client = createMockClient({ users: null, queryError: { message: 'db error' } })
    const result = await listStaff(client, 'kg-1')

    expect(result).toEqual({ success: false, error: 'db error' })
  })
})

describe('updateStaffProfile', () => {
  it('sets full_name and updated_by', async () => {
    const client = createMockClient()
    const result = await updateStaffProfile(client, 'user-2', { fullName: 'Maria I.' }, 'user-1')

    expect(result).toEqual({ success: true, data: sampleRow })
    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith(expect.objectContaining({
      full_name: 'Maria I.',
      updated_by: 'user-1',
    }))
  })

  it('includes role in the update when provided', async () => {
    const client = createMockClient()
    await updateStaffProfile(client, 'user-2', { fullName: 'Maria I.', role: 'educator' }, 'user-1')

    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith(expect.objectContaining({ role: 'educator' }))
  })

  it('omits role from the update when not provided', async () => {
    const client = createMockClient()
    await updateStaffProfile(client, 'user-2', { fullName: 'Maria I.' }, 'user-1')

    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    const callArg = updateCall.mock.calls[0][0] as Record<string, unknown>
    expect(callArg).not.toHaveProperty('role')
  })
})

describe('setStaffStatus', () => {
  it('updates status and updated_by', async () => {
    const client = createMockClient()
    await setStaffStatus(client, 'user-2', 'inactive', 'user-1')

    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith({ status: 'inactive', updated_by: 'user-1' })
  })
})

describe('removeFromKindergarten', () => {
  it('deletes the correct user_kindergartens row by user_id and kindergarten_id', async () => {
    const client = createMockClient()
    const result = await removeFromKindergarten(client, 'user-2', 'kg-1')

    expect(result).toEqual({ success: true, data: null })
    expect(client.from).toHaveBeenCalledWith('user_kindergartens')
    expect(mockDeleteEq1).toHaveBeenCalledWith('user_id', 'user-2')
    expect(mockDeleteEq2).toHaveBeenCalledWith('kindergarten_id', 'kg-1')
  })

  it('returns failure when the delete errors', async () => {
    const client = createMockClient({ deleteError: { message: 'delete failed' } })
    const result = await removeFromKindergarten(client, 'user-2', 'kg-1')

    expect(result).toEqual({ success: false, error: 'delete failed' })
  })
})

const moduleRow = {
  id: 'um-1',
  user_id: 'user-2',
  kindergarten_id: 'kg-1',
  module_key: 'pool' as const,
  granted_by: 'user-1',
  granted_at: '2026-07-02T00:00:00Z',
  created_at: '2026-07-02T00:00:00Z',
  updated_at: '2026-07-02T00:00:00Z',
  created_by: 'user-1',
  updated_by: 'user-1',
  deleted_at: null,
}

describe('listUserModules', () => {
  it('returns live module rows for a user in a kindergarten', async () => {
    const mockIs = vi.fn().mockResolvedValue({ data: [moduleRow], error: null })
    const mockEq2 = vi.fn().mockReturnValue({ is: mockIs })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const client = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEq1 }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await listUserModules(client, 'user-2', 'kg-1')
    expect(result).toEqual({ success: true, data: [moduleRow] })
    expect(client.from).toHaveBeenCalledWith('user_modules')
    expect(mockEq1).toHaveBeenCalledWith('user_id', 'user-2')
    expect(mockEq2).toHaveBeenCalledWith('kindergarten_id', 'kg-1')
    expect(mockIs).toHaveBeenCalledWith('deleted_at', null)
  })
})

describe('grantModule', () => {
  // Builds the lookup chain: select('*').eq().eq().eq().is('deleted_at', null).maybeSingle()
  function mockLookupChain(existing: UserModuleRow | null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null })
    const mockIsDeleted = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEq3 = vi.fn().mockReturnValue({ is: mockIsDeleted })
    const mockEq2 = vi.fn().mockReturnValue({ eq: mockEq3 })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelectLookup = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { mockSelectLookup, mockEq1, mockEq2, mockEq3, mockIsDeleted, mockMaybeSingle }
  }

  it('no existing row: inserts a grant row with granted_by set to the actor', async () => {
    const { mockSelectLookup } = mockLookupChain(null)

    const mockSingle = vi.fn().mockResolvedValue({ data: moduleRow, error: null })
    const mockSelectInsert = vi.fn().mockReturnValue({ single: mockSingle })
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelectInsert })
    const mockUpdate = vi.fn()

    const client = {
      from: vi.fn().mockReturnValue({
        select: mockSelectLookup,
        insert: mockInsert,
        update: mockUpdate,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await grantModule(client, 'user-2', 'kg-1', 'pool', 'user-1')
    expect(result).toEqual({ success: true, data: moduleRow })
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-2',
      kindergarten_id: 'kg-1',
      module_key: 'pool',
      granted_by: 'user-1',
    })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('re-grant of a live row is a no-op: returns the existing row, no insert/update', async () => {
    const { mockSelectLookup } = mockLookupChain(moduleRow)

    const mockInsert = vi.fn()
    const mockUpdate = vi.fn()

    const client = {
      from: vi.fn().mockReturnValue({
        select: mockSelectLookup,
        insert: mockInsert,
        update: mockUpdate,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await grantModule(client, 'user-2', 'kg-1', 'pool', 'user-1')
    expect(result).toEqual({ success: true, data: moduleRow })
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('revokeModule', () => {
  it('soft-deletes the live grant row matching user, kindergarten and key', async () => {
    const mockIs = vi.fn().mockResolvedValue({ error: null })
    const mockEq3 = vi.fn().mockReturnValue({ is: mockIs })
    const mockEq2 = vi.fn().mockReturnValue({ eq: mockEq3 })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    const client = { from: vi.fn().mockReturnValue({ update: mockUpdate }) } as any // eslint-disable-line @typescript-eslint/no-explicit-any

    const result = await revokeModule(client, 'user-2', 'kg-1', 'pool')
    expect(result).toEqual({ success: true, data: null })
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }))
    expect(mockEq1).toHaveBeenCalledWith('user_id', 'user-2')
    expect(mockEq2).toHaveBeenCalledWith('kindergarten_id', 'kg-1')
    expect(mockEq3).toHaveBeenCalledWith('module_key', 'pool')
    expect(mockIs).toHaveBeenCalledWith('deleted_at', null)
  })
})

describe('listAssignedKindergartens', () => {
  it('maps the joined kindergarten rows to {id, name}', async () => {
    const mockEq = vi.fn().mockResolvedValue({
      data: [{ kindergarten_id: 'kg-1', kindergartens: { id: 'kg-1', name: 'Sunflower' } }],
      error: null,
    })
    const client = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEq }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await listAssignedKindergartens(client, 'user-2')
    expect(result).toEqual({ success: true, data: [{ id: 'kg-1', name: 'Sunflower' }] })
    expect(client.from).toHaveBeenCalledWith('user_kindergartens')
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-2')
  })
})
