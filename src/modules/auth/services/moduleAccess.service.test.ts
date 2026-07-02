import { describe, it, expect, vi } from 'vitest'
import { listUserModuleGrants } from './moduleAccess.service'

function createMockClient(opts: {
  rows?: Array<{ kindergarten_id: string; module_key: string }> | null
  error?: { message: string } | null
} = {}) {
  const { rows = [], error = null } = opts
  const mockIs = vi.fn().mockResolvedValue({ data: rows, error })
  const mockEq = vi.fn().mockReturnValue({ is: mockIs })
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
  return {
    from: vi.fn().mockReturnValue({ select: mockSelect }),
    _mocks: { mockIs, mockEq, mockSelect },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('listUserModuleGrants', () => {
  it('maps rows to camelCase ModuleGrant and filters live rows for the user', async () => {
    const client = createMockClient({
      rows: [
        { kindergarten_id: 'kg-1', module_key: 'pool' },
        { kindergarten_id: 'kg-2', module_key: 'payroll_own' },
      ],
    })
    const result = await listUserModuleGrants(client, 'user-9')

    expect(result).toEqual({
      success: true,
      data: [
        { kindergartenId: 'kg-1', moduleKey: 'pool' },
        { kindergartenId: 'kg-2', moduleKey: 'payroll_own' },
      ],
    })
    expect(client.from).toHaveBeenCalledWith('user_modules')
    expect(client._mocks.mockEq).toHaveBeenCalledWith('user_id', 'user-9')
    expect(client._mocks.mockIs).toHaveBeenCalledWith('deleted_at', null)
  })

  it('returns an empty array when the user has no grants', async () => {
    const client = createMockClient({ rows: [] })
    const result = await listUserModuleGrants(client, 'user-9')
    expect(result).toEqual({ success: true, data: [] })
  })

  it('returns failure when the query errors', async () => {
    const client = createMockClient({ rows: null, error: { message: 'db error' } })
    const result = await listUserModuleGrants(client, 'user-9')
    expect(result).toEqual({ success: false, error: 'db error' })
  })
})
