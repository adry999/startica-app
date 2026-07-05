import { describe, it, expect, vi } from 'vitest'
import { listAvailability, addAvailability, removeAvailability, createPattern, listPatterns, deletePattern, computeOccurrenceDates, generateMissingSessions, listSessions, cancelSession, listParticipants, addParticipant, removeParticipant } from './pool.service'

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

describe('generateMissingSessions', () => {
  it('inserts a session per missing occurrence and seeds participants from the default group', async () => {
    const generationPattern = {
      id: 'pattern-1', kindergarten_id: 'kg-1', trainer_user_id: 'user-1',
      weekday: 2, start_time: '10:00:00', end_time: '11:00:00',
      default_group_id: 'group-1', capacity: 8,
      active_from: '2026-09-01', active_until: null,
    }
    const sessionsInsert = vi.fn((rows: Array<Record<string, unknown>>) => ({
      select: vi.fn().mockResolvedValue({
        data: rows.map((r, i) => ({ ...r, id: `session-${i}` })),
        error: null,
      }),
    }))
    const participantsInsert = vi.fn().mockResolvedValue({ error: null })
    const childrenKgEq = vi.fn().mockReturnValue({
      is: vi.fn().mockResolvedValue({ data: [{ id: 'child-1' }, { id: 'child-2' }], error: null }),
    })
    const childrenStatusEq = vi.fn().mockReturnValue({ eq: childrenKgEq })
    const childrenGroupEq = vi.fn().mockReturnValue({ eq: childrenStatusEq })

    const client = {
      from: vi.fn((table: string) => {
        if (table === 'pool_schedule_patterns') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [generationPattern], error: null }),
              }),
            }),
          }
        }
        if (table === 'pool_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            insert: sessionsInsert,
          }
        }
        if (table === 'children') {
          return { select: vi.fn().mockReturnValue({ eq: childrenGroupEq }) }
        }
        if (table === 'pool_session_participants') {
          return { insert: participantsInsert }
        }
        throw new Error(`unexpected table ${table}`)
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await generateMissingSessions(client, 'kg-1', new Date('2026-09-01T00:00:00Z'))
    expect(result).toEqual({ success: true, data: undefined })

    // 8-week window starting Tue 2026-09-01 → 9 Tuesdays
    expect(sessionsInsert).toHaveBeenCalledTimes(1)
    const insertedSessions = sessionsInsert.mock.calls[0]![0] as Array<Record<string, unknown>>
    expect(insertedSessions).toHaveLength(9)
    expect(insertedSessions[0]).toEqual({
      kindergarten_id: 'kg-1',
      trainer_user_id: 'user-1',
      source_pattern_id: 'pattern-1',
      session_date: '2026-09-01',
      start_time: '10:00:00',
      end_time: '11:00:00',
      capacity: 8,
      group_id: 'group-1',
      status: 'scheduled',
    })

    // children roster query scoped to the default group, enrolled, tenant, live
    expect(childrenGroupEq).toHaveBeenCalledWith('group_id', 'group-1')
    expect(childrenStatusEq).toHaveBeenCalledWith('status', 'enrolled')
    expect(childrenKgEq).toHaveBeenCalledWith('kindergarten_id', 'kg-1')

    // 9 sessions × 2 children = 18 participant rows
    expect(participantsInsert).toHaveBeenCalledTimes(1)
    const participantRows = participantsInsert.mock.calls[0]![0] as Array<Record<string, unknown>>
    expect(participantRows).toHaveLength(18)
    expect(participantRows[0]).toEqual({
      session_id: 'session-0',
      kindergarten_id: 'kg-1',
      child_id: 'child-1',
      status: 'enrolled',
    })
  })

  it('does not insert when an instance already exists for the date', async () => {
    const insertFn = vi.fn()
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'pool_schedule_patterns') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({
                  data: [{
                    id: 'pattern-1', kindergarten_id: 'kg-1', trainer_user_id: 'user-1',
                    weekday: 2, start_time: '10:00:00', end_time: '11:00:00',
                    default_group_id: null, capacity: 8,
                    active_from: '2026-09-01', active_until: '2026-09-01',
                  }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'pool_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [{ session_date: '2026-09-01' }], error: null }),
              }),
            }),
            insert: insertFn,
          }
        }
        throw new Error(`unexpected table ${table}`)
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await generateMissingSessions(client, 'kg-1', new Date('2026-09-01T00:00:00Z'))
    expect(result).toEqual({ success: true, data: undefined })
    expect(insertFn).not.toHaveBeenCalled()
  })

  it('returns failure and stops when the patterns query errors', async () => {
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'pool_schedule_patterns') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
              }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await generateMissingSessions(client, 'kg-1', new Date('2026-09-01T00:00:00Z'))
    expect(result).toEqual({ success: false, error: 'db down' })
  })

  it('returns failure on session-insert error and never queries children', async () => {
    const fromCalls: string[] = []
    const client = {
      from: vi.fn((table: string) => {
        fromCalls.push(table)
        if (table === 'pool_schedule_patterns') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({
                  data: [{
                    id: 'pattern-1', kindergarten_id: 'kg-1', trainer_user_id: 'user-1',
                    weekday: 2, start_time: '10:00:00', end_time: '11:00:00',
                    default_group_id: 'group-1', capacity: 8,
                    active_from: '2026-09-01', active_until: '2026-09-01',
                  }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'pool_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await generateMissingSessions(client, 'kg-1', new Date('2026-09-01T00:00:00Z'))
    expect(result).toEqual({ success: false, error: 'insert failed' })
    expect(fromCalls).not.toContain('children')
    expect(fromCalls).not.toContain('pool_session_participants')
  })

  it('skips participant seeding when the pattern has no default group', async () => {
    const fromCalls: string[] = []
    const client = {
      from: vi.fn((table: string) => {
        fromCalls.push(table)
        if (table === 'pool_schedule_patterns') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({
                  data: [{
                    id: 'pattern-1', kindergarten_id: 'kg-1', trainer_user_id: 'user-1',
                    weekday: 2, start_time: '10:00:00', end_time: '11:00:00',
                    default_group_id: null, capacity: 8,
                    active_from: '2026-09-01', active_until: '2026-09-01',
                  }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'pool_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            insert: vi.fn((rows: Array<Record<string, unknown>>) => ({
              select: vi.fn().mockResolvedValue({
                data: rows.map((r, i) => ({ ...r, id: `session-${i}` })),
                error: null,
              }),
            })),
          }
        }
        throw new Error(`unexpected table ${table}`)
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await generateMissingSessions(client, 'kg-1', new Date('2026-09-01T00:00:00Z'))
    expect(result).toEqual({ success: true, data: undefined })
    expect(fromCalls).not.toContain('children')
    expect(fromCalls).not.toContain('pool_session_participants')
  })

  it('skips participant insert when the default group has no enrolled children', async () => {
    const fromCalls: string[] = []
    const client = {
      from: vi.fn((table: string) => {
        fromCalls.push(table)
        if (table === 'pool_schedule_patterns') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({
                  data: [{
                    id: 'pattern-1', kindergarten_id: 'kg-1', trainer_user_id: 'user-1',
                    weekday: 2, start_time: '10:00:00', end_time: '11:00:00',
                    default_group_id: 'group-1', capacity: 8,
                    active_from: '2026-09-01', active_until: '2026-09-01',
                  }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'pool_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            insert: vi.fn((rows: Array<Record<string, unknown>>) => ({
              select: vi.fn().mockResolvedValue({
                data: rows.map((r, i) => ({ ...r, id: `session-${i}` })),
                error: null,
              }),
            })),
          }
        }
        if (table === 'children') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await generateMissingSessions(client, 'kg-1', new Date('2026-09-01T00:00:00Z'))
    expect(result).toEqual({ success: true, data: undefined })
    expect(fromCalls).toContain('children')
    expect(fromCalls).not.toContain('pool_session_participants')
  })
})

describe('listSessions', () => {
  it('generates missing instances then returns sessions with participant counts', async () => {
    const sessionKindergartenEq = vi.fn().mockReturnValue({
      is: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [{
            id: 'session-1', kindergarten_id: 'kg-1', trainer_user_id: 'user-1',
            source_pattern_id: null, session_date: '2026-09-01',
            start_time: '10:00:00', end_time: '11:00:00', capacity: 8,
            group_id: null, status: 'scheduled',
            pool_session_participants: [{ count: 2 }],
          }],
          error: null,
        }),
      }),
    })
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'pool_schedule_patterns') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }
        }
        if (table === 'pool_sessions') {
          return { select: vi.fn().mockReturnValue({ eq: sessionKindergartenEq }) }
        }
        throw new Error(`unexpected table ${table}`)
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await listSessions(client, 'kg-1', new Date('2026-09-01T00:00:00Z'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([{
        id: 'session-1',
        kindergartenId: 'kg-1',
        trainerUserId: 'user-1',
        sourcePatternId: null,
        sessionDate: '2026-09-01',
        startTime: '10:00:00',
        endTime: '11:00:00',
        capacity: 8,
        groupId: null,
        status: 'scheduled',
        participantCount: 2,
      }])
    }
    expect(sessionKindergartenEq).toHaveBeenCalledWith('kindergarten_id', 'kg-1')
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

describe('cancelSession', () => {
  it('sets status to cancelled', async () => {
    const eqFilter = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: eqFilter })
    const client = {
      from: vi.fn().mockReturnValue({ update }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await cancelSession(client, 'session-1', 'actor-1')
    expect(result).toEqual({ success: true, data: undefined })
    expect(update).toHaveBeenCalledWith({ status: 'cancelled', updated_by: 'actor-1' })
    expect(eqFilter).toHaveBeenCalledWith('id', 'session-1')
  })
})

describe('listParticipants', () => {
  it('returns mapped participants with child name', async () => {
    const isFilter = vi.fn().mockResolvedValue({
      data: [{
        id: 'part-1', session_id: 'session-1', child_id: 'child-1', status: 'enrolled',
        children: { first_name: 'Ana', last_name: 'Pop' },
      }],
      error: null,
    })
    const sessionEq = vi.fn().mockReturnValue({ is: isFilter })
    const select = vi.fn().mockReturnValue({ eq: sessionEq })
    const client = {
      from: vi.fn().mockReturnValue({ select }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await listParticipants(client, 'session-1')
    expect(result).toEqual({
      success: true,
      data: [{ id: 'part-1', sessionId: 'session-1', childId: 'child-1', childName: 'Ana Pop', status: 'enrolled' }],
    })
    expect(select).toHaveBeenCalledWith('*, children(first_name, last_name)')
    expect(sessionEq).toHaveBeenCalledWith('session_id', 'session-1')
    expect(isFilter).toHaveBeenCalledWith('deleted_at', null)
  })
})

describe('addParticipant', () => {
  it('rejects when the session is at capacity', async () => {
    const countStatusEq = vi.fn().mockResolvedValue({ count: 1, error: null })
    const countSessionEq = vi.fn().mockReturnValue({ eq: countStatusEq })
    const countSelect = vi.fn().mockReturnValue({ eq: countSessionEq })

    const sessionSingle = vi.fn().mockResolvedValue({ data: { capacity: 1, kindergarten_id: 'kg-1' }, error: null })
    const sessionIdEq = vi.fn().mockReturnValue({ single: sessionSingle })
    const sessionSelect = vi.fn().mockReturnValue({ eq: sessionIdEq })

    let call = 0
    const client = {
      from: vi.fn(() => {
        call += 1
        if (call === 1) return { select: sessionSelect }
        return { select: countSelect }
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await addParticipant(client, 'session-1', 'child-1', 'actor-1')
    expect(result).toEqual({ success: false, error: 'session_full' })

    expect(sessionSelect).toHaveBeenCalledWith('capacity, kindergarten_id')
    expect(sessionIdEq).toHaveBeenCalledWith('id', 'session-1')
    expect(countSelect).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(countSessionEq).toHaveBeenCalledWith('session_id', 'session-1')
    expect(countStatusEq).toHaveBeenCalledWith('status', 'enrolled')
  })

  it('inserts the participant when under capacity', async () => {
    const countStatusEq = vi.fn().mockResolvedValue({ count: 2, error: null })
    const countSessionEq = vi.fn().mockReturnValue({ eq: countStatusEq })
    const countSelect = vi.fn().mockReturnValue({ eq: countSessionEq })

    const sessionSingle = vi.fn().mockResolvedValue({ data: { capacity: 8, kindergarten_id: 'kg-1' }, error: null })
    const sessionIdEq = vi.fn().mockReturnValue({ single: sessionSingle })
    const sessionSelect = vi.fn().mockReturnValue({ eq: sessionIdEq })

    const insertSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'part-1', session_id: 'session-1', child_id: 'child-1', status: 'enrolled',
        children: { first_name: 'Ana', last_name: 'Pop' },
      },
      error: null,
    })
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })

    let call = 0
    const client = {
      from: vi.fn(() => {
        call += 1
        if (call === 1) return { select: sessionSelect }
        if (call === 2) return { select: countSelect }
        return { insert }
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await addParticipant(client, 'session-1', 'child-1', 'actor-1')
    expect(result).toEqual({
      success: true,
      data: { id: 'part-1', sessionId: 'session-1', childId: 'child-1', childName: 'Ana Pop', status: 'enrolled' },
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'session-1',
        kindergarten_id: 'kg-1',
        child_id: 'child-1',
        status: 'enrolled',
        created_by: 'actor-1',
        updated_by: 'actor-1',
      }),
    )
    expect(insertSelect).toHaveBeenCalledWith('*, children(first_name, last_name)')
    expect(countSessionEq).toHaveBeenCalledWith('session_id', 'session-1')
    expect(countStatusEq).toHaveBeenCalledWith('status', 'enrolled')
  })
})

describe('removeParticipant', () => {
  it('soft-deletes and sets status removed', async () => {
    const eqFilter = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: eqFilter })
    const client = {
      from: vi.fn().mockReturnValue({ update }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await removeParticipant(client, 'part-1', 'actor-1')
    expect(result).toEqual({ success: true, data: undefined })
    const payload = update.mock.calls[0][0]
    expect(payload.status).toBe('removed')
    expect(payload.deleted_at).toBeTruthy()
    expect(payload.updated_by).toBe('actor-1')
    expect(eqFilter).toHaveBeenCalledWith('id', 'part-1')
  })
})
