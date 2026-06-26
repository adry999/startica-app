import { describe, it, expect, vi } from 'vitest'
import {
  listStaff,
  updateStaffProfile,
  setStaffStatus,
  removeFromKindergarten,
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

let mockIs: ReturnType<typeof vi.fn>
let mockNeq: ReturnType<typeof vi.fn>

function createMockClient(opts: {
  memberships?: Array<{ user_id: string }>
  users?: typeof sampleRow[]
  mutationResult?: typeof sampleRow | null
  deleteError?: { message: string } | null
} = {}) {
  const {
    memberships = [{ user_id: 'user-2' }],
    users = [sampleRow],
    mutationResult = sampleRow,
    deleteError = null,
  } = opts

  mockNeq = vi.fn().mockReturnValue({
    order: vi.fn().mockResolvedValue({ data: users, error: null }),
  })
  mockIs = vi.fn().mockReturnValue({ neq: mockNeq })

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'user_kindergartens') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: memberships, error: null }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: deleteError }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({ is: mockIs }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mutationResult, error: null }),
            }),
          }),
        }),
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('listStaff', () => {
  it('returns users for the given kindergarten, excluding super_admins', async () => {
    const client = createMockClient()
    const result = await listStaff(client, 'kg-1')

    expect(result).toEqual({ success: true, data: [sampleRow] })
    expect(client.from).toHaveBeenCalledWith('user_kindergartens')
    expect(client.from).toHaveBeenCalledWith('users')
  })

  it('returns an empty array when the kindergarten has no members', async () => {
    const client = createMockClient({ memberships: [] })
    const result = await listStaff(client, 'kg-1')

    expect(result).toEqual({ success: true, data: [] })
  })

  it('filters out soft-deleted rows and super_admin accounts', async () => {
    const client = createMockClient()
    await listStaff(client, 'kg-1')

    expect(mockIs).toHaveBeenCalledWith('deleted_at', null)
    expect(mockNeq).toHaveBeenCalledWith('role', 'super_admin')
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
  it('deletes the user_kindergartens row', async () => {
    const client = createMockClient()
    const result = await removeFromKindergarten(client, 'user-2', 'kg-1')

    expect(result).toEqual({ success: true, data: null })
    expect(client.from).toHaveBeenCalledWith('user_kindergartens')
  })

  it('returns failure when the delete errors', async () => {
    const client = createMockClient({ deleteError: { message: 'delete failed' } })
    const result = await removeFromKindergarten(client, 'user-2', 'kg-1')

    expect(result).toEqual({ success: false, error: 'delete failed' })
  })
})
