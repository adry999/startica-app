import { describe, it, expect, vi } from 'vitest'
import { listAvailability, addAvailability, removeAvailability } from './pool.service'

const availabilityRow = {
  id: 'avail-1',
  kindergarten_id: 'kg-1',
  trainer_user_id: 'user-1',
  weekday: 1,
  start_time: '09:00:00',
  end_time: '12:00:00',
}

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [availabilityRow], error: null }),
            }),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: availabilityRow, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      ...overrides,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('listAvailability', () => {
  it('returns mapped availability rows', async () => {
    const client = mockClient()
    const result = await listAvailability(client, 'kg-1', 'user-1')
    expect(result).toEqual({
      success: true,
      data: [{ id: 'avail-1', kindergartenId: 'kg-1', trainerUserId: 'user-1', weekday: 1, startTime: '09:00:00', endTime: '12:00:00' }],
    })
  })
})

describe('addAvailability', () => {
  it('inserts with actor as created_by/updated_by', async () => {
    const client = mockClient()
    const result = await addAvailability(
      client,
      { kindergartenId: 'kg-1', trainerUserId: 'user-1', weekday: 1, startTime: '09:00', endTime: '12:00' },
      'actor-1',
    )
    expect(result.success).toBe(true)
    const insertCall = client.from.mock.results[0].value.insert as ReturnType<typeof vi.fn>
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({
        kindergarten_id: 'kg-1',
        trainer_user_id: 'user-1',
        weekday: 1,
        start_time: '09:00',
        end_time: '12:00',
        created_by: 'actor-1',
        updated_by: 'actor-1',
      }),
    )
  })
})

describe('removeAvailability', () => {
  it('soft-deletes by setting deleted_at', async () => {
    const client = mockClient()
    const result = await removeAvailability(client, 'avail-1', 'actor-1')
    expect(result).toEqual({ success: true, data: undefined })
    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    const payload = updateCall.mock.calls[0][0]
    expect(payload.updated_by).toBe('actor-1')
    expect(payload.deleted_at).toBeTruthy()
  })
})
