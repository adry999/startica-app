import { describe, it, expect } from 'vitest'
import { kindergartenDetailsSchema, kindergartenSettingsSchema } from './kindergarten.schema'

describe('kindergartenDetailsSchema', () => {
  it('accepts a name with no other fields', () => {
    const result = kindergartenDetailsSchema.safeParse({ name: 'Grădinița Zâna Florilor' })
    expect(result.success).toBe(true)
  })

  it('rejects an empty name', () => {
    const result = kindergartenDetailsSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('accepts optional address/city/phone', () => {
    const result = kindergartenDetailsSchema.safeParse({
      name: 'Grădinița Zâna Florilor',
      address: 'Str. Primăverii nr. 12',
      city: 'Cluj-Napoca',
      phone: '+40 264 123 456',
    })
    expect(result.success).toBe(true)
  })
})

describe('kindergartenSettingsSchema', () => {
  it('accepts a valid settings payload', () => {
    const result = kindergartenSettingsSchema.safeParse({
      timezone: 'Europe/Bucharest',
      defaultLocale: 'ro',
      workingHoursStart: '07:30',
      workingHoursEnd: '18:00',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a locale outside ro/en', () => {
    const result = kindergartenSettingsSchema.safeParse({
      timezone: 'Europe/Bucharest',
      defaultLocale: 'fr',
      workingHoursStart: '07:30',
      workingHoursEnd: '18:00',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed working-hours time', () => {
    const result = kindergartenSettingsSchema.safeParse({
      timezone: 'Europe/Bucharest',
      defaultLocale: 'ro',
      workingHoursStart: '7:30am',
      workingHoursEnd: '18:00',
    })
    expect(result.success).toBe(false)
  })
})
