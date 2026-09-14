import { describe, expect, it } from 'vitest'
import { todayAsCalendarDate } from './calendarDate'

describe('todayAsCalendarDate', () => {
  it('uses the local calendar day even just after local midnight', () => {
    expect(todayAsCalendarDate(new Date(2026, 8, 1, 0, 30))).toBe('2026-09-01')
  })

  it('pads single-digit months and days', () => {
    expect(todayAsCalendarDate(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05')
  })
})
