import { describe, it, expect, vi } from 'vitest'
import { listAvailability, addAvailability, removeAvailability, createPattern, listPatterns, deletePattern, computeOccurrenceDates } from './pool.service'

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

    // Assert filter arguments
    const selectChain = client.from.mock.results[0].value.select()
    const firstEq = selectChain.eq as ReturnType<typeof vi.fn>
    expect(firstEq).toHaveBeenCalledWith('kindergarten_id', 'kg-1')

    const secondEq = firstEq.mock.results[0].value.eq as ReturnType<typeof vi.fn>
    expect(secondEq).toHaveBeenCalledWith('trainer_user_id', 'user-1')
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

    // Assert filter argument for ID
    const eqFilter = updateCall.mock.results[0].value.eq as ReturnType<typeof vi.fn>
    expect(eqFilter).toHaveBeenCalledWith('id', 'avail-1')
  })
})

const patternRow = {
  id: 'pattern-1',
  kindergarten_id: 'kg-1',
  trainer_user_id: 'user-1',
  weekday: 1,
  start_time: '10:00:00',
  end_time: '11:00:00',
  default_group_id: 'group-1',
  capacity: 8,
  active_from: '2026-09-01',
  active_until: null,
}

function mockCreatePatternClient(availabilityRows: Array<{ start_time: string; end_time: string }>) {
  const weekdayEq = vi.fn().mockReturnValue({
    is: vi.fn().mockResolvedValue({ data: availabilityRows, error: null }),
  })
  const kindergartenEq = vi.fn().mockReturnValue({ eq: weekdayEq })
  const trainerEq = vi.fn().mockReturnValue({ eq: kindergartenEq })
  const select = vi.fn().mockReturnValue({ eq: trainerEq })
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: patternRow, error: null }),
    }),
  })
  const client = {
    from: vi.fn().mockReturnValue({ select, insert }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
  return { client, select, trainerEq, kindergartenEq, weekdayEq, insert }
}

describe('createPattern', () => {
  it('rejects a pattern outside the trainer availability window', async () => {
    const { client } = mockCreatePatternClient([])
    const result = await createPattern(
      client,
      {
        kindergartenId: 'kg-1',
        trainerUserId: 'user-1',
        weekday: 1,
        startTime: '10:00',
        endTime: '11:00',
        capacity: 8,
        activeFrom: '2026-09-01',
      },
      'actor-1',
    )
    expect(result).toEqual({ success: false, error: 'outside_trainer_availability' })
  })

  it('creates a pattern that fits inside an availability window', async () => {
    const { client, trainerEq, kindergartenEq, weekdayEq, insert } = mockCreatePatternClient([
      { start_time: '09:00:00', end_time: '12:00:00' },
    ])
    const result = await createPattern(
      client,
      {
        kindergartenId: 'kg-1',
        trainerUserId: 'user-1',
        weekday: 1,
        startTime: '10:00',
        endTime: '11:00',
        defaultGroupId: 'group-1',
        capacity: 8,
        activeFrom: '2026-09-01',
      },
      'actor-1',
    )
    expect(result.success).toBe(true)

    expect(trainerEq).toHaveBeenCalledWith('trainer_user_id', 'user-1')
    expect(kindergartenEq).toHaveBeenCalledWith('kindergarten_id', 'kg-1')
    expect(weekdayEq).toHaveBeenCalledWith('weekday', 1)

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kindergarten_id: 'kg-1',
        trainer_user_id: 'user-1',
        weekday: 1,
        start_time: '10:00',
        end_time: '11:00',
        default_group_id: 'group-1',
        capacity: 8,
        active_from: '2026-09-01',
        active_until: null,
        created_by: 'actor-1',
        updated_by: 'actor-1',
      }),
    )
  })

  it('accepts a pattern whose boundaries exactly match the availability window', async () => {
    const { client } = mockCreatePatternClient([{ start_time: '09:00:00', end_time: '12:00:00' }])
    const result = await createPattern(
      client,
      {
        kindergartenId: 'kg-1',
        trainerUserId: 'user-1',
        weekday: 1,
        startTime: '09:00',
        endTime: '12:00',
        capacity: 8,
        activeFrom: '2026-09-01',
      },
      'actor-1',
    )
    expect(result.success).toBe(true)
  })
})

describe('listPatterns', () => {
  it('returns mapped pattern rows', async () => {
    const kindergartenEq = vi.fn().mockReturnValue({
      is: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [patternRow], error: null }),
      }),
    })
    const select = vi.fn().mockReturnValue({ eq: kindergartenEq })
    const client = {
      from: vi.fn().mockReturnValue({ select }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await listPatterns(client, 'kg-1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0]).toEqual({
        id: 'pattern-1',
        kindergartenId: 'kg-1',
        trainerUserId: 'user-1',
        weekday: 1,
        startTime: '10:00:00',
        endTime: '11:00:00',
        defaultGroupId: 'group-1',
        capacity: 8,
        activeFrom: '2026-09-01',
        activeUntil: null,
      })
    }
    expect(kindergartenEq).toHaveBeenCalledWith('kindergarten_id', 'kg-1')
  })

  it('filters by trainer_user_id when trainerUserId is passed', async () => {
    const trainerEq = vi.fn().mockResolvedValue({ data: [patternRow], error: null })
    const order = vi.fn().mockReturnValue({ eq: trainerEq })
    const kindergartenEq = vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ order }) })
    const select = vi.fn().mockReturnValue({ eq: kindergartenEq })
    const client = {
      from: vi.fn().mockReturnValue({ select }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await listPatterns(client, 'kg-1', 'user-1')
    expect(result.success).toBe(true)
    expect(kindergartenEq).toHaveBeenCalledWith('kindergarten_id', 'kg-1')
    expect(trainerEq).toHaveBeenCalledWith('trainer_user_id', 'user-1')
  })
})

describe('deletePattern', () => {
  it('soft-deletes by setting deleted_at', async () => {
    const eqFilter = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: eqFilter })
    const client = {
      from: vi.fn().mockReturnValue({ update }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await deletePattern(client, 'pattern-1', 'actor-1')
    expect(result).toEqual({ success: true, data: undefined })

    const payload = update.mock.calls[0][0]
    expect(payload.updated_by).toBe('actor-1')
    expect(payload.deleted_at).toBeTruthy()
    expect(eqFilter).toHaveBeenCalledWith('id', 'pattern-1')
  })
})

describe('computeOccurrenceDates', () => {
  it('returns weekly dates matching the weekday within the window', () => {
    // 2026-09-01 is a Tuesday (weekday 2). today = 2026-09-01.
    const dates = computeOccurrenceDates(2, '2026-09-01', null, 3, new Date('2026-09-01T00:00:00Z'))
    expect(dates).toEqual(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'])
  })

  it('does not return dates before activeFrom', () => {
    const dates = computeOccurrenceDates(2, '2026-09-10', null, 3, new Date('2026-09-01T00:00:00Z'))
    expect(dates.every(d => d >= '2026-09-10')).toBe(true)
    expect(dates[0]).toBe('2026-09-15')
  })

  it('stops at activeUntil when earlier than the window end', () => {
    const dates = computeOccurrenceDates(2, '2026-09-01', '2026-09-10', 8, new Date('2026-09-01T00:00:00Z'))
    expect(dates).toEqual(['2026-09-01', '2026-09-08'])
  })

  it('starts from today when activeFrom is in the past', () => {
    const dates = computeOccurrenceDates(2, '2026-01-01', null, 1, new Date('2026-09-01T00:00:00Z'))
    expect(dates[0]).toBe('2026-09-01')
  })
})
