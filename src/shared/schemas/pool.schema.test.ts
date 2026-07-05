import { describe, it, expect } from 'vitest'
import { trainerAvailabilitySchema, schedulePatternSchema } from './pool.schema'

describe('trainerAvailabilitySchema', () => {
  it('accepts a valid window', () => {
    const result = trainerAvailabilitySchema.safeParse({ weekday: 1, startTime: '09:00', endTime: '12:00' })
    expect(result.success).toBe(true)
  })

  it('rejects when endTime is not after startTime', () => {
    const result = trainerAvailabilitySchema.safeParse({ weekday: 1, startTime: '12:00', endTime: '09:00' })
    expect(result.success).toBe(false)
  })

  it('rejects weekday out of range', () => {
    const result = trainerAvailabilitySchema.safeParse({ weekday: 7, startTime: '09:00', endTime: '12:00' })
    expect(result.success).toBe(false)
  })
})

describe('schedulePatternSchema', () => {
  it('accepts a valid pattern', () => {
    const result = schedulePatternSchema.safeParse({
      weekday: 2,
      startTime: '10:00',
      endTime: '11:00',
      defaultGroupId: null,
      capacity: 8,
      activeFrom: '2026-09-01',
      activeUntil: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects capacity of 0', () => {
    const result = schedulePatternSchema.safeParse({
      weekday: 2,
      startTime: '10:00',
      endTime: '11:00',
      capacity: 0,
      activeFrom: '2026-09-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects endTime before startTime', () => {
    const result = schedulePatternSchema.safeParse({
      weekday: 2,
      startTime: '11:00',
      endTime: '10:00',
      capacity: 8,
      activeFrom: '2026-09-01',
    })
    expect(result.success).toBe(false)
  })
})
