import { describe, it, expect, vi } from 'vitest'
import {
  listKindergartens,
  createKindergarten,
  updateKindergartenDetails,
  updateKindergartenSettings,
  setKindergartenStatus,
} from './kindergartens.service'

const sampleRow = {
  id: 'kg-1',
  name: 'Grădinița Zâna Florilor',
  address: 'Str. Primăverii nr. 12',
  city: 'Cluj-Napoca',
  phone: '+40 264 123 456',
  logo_url: null,
  status: 'active',
  settings: { timezone: 'Europe/Bucharest', default_locale: 'ro', working_hours: { start: '07:30', end: '18:00' } },
  created_at: '2026-06-24T00:00:00Z',
  updated_at: '2026-06-24T00:00:00Z',
  created_by: 'user-1',
  updated_by: 'user-1',
  deleted_at: null,
}

function createMockClient(overrides: { from?: Record<string, unknown> } = {}) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [sampleRow], error: null }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: sampleRow, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: sampleRow, error: null }),
          }),
        }),
      }),
      ...overrides.from,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('listKindergartens', () => {
  it('returns the non-deleted rows ordered by name', async () => {
    const client = createMockClient()
    const result = await listKindergartens(client)
    expect(result).toEqual({ success: true, data: [sampleRow] })
    expect(client.from).toHaveBeenCalledWith('kindergartens')
  })

  it('returns failure when Supabase errors', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: 'network error' } }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await listKindergartens(client)
    expect(result).toEqual({ success: false, error: 'network error' })
  })
})

describe('createKindergarten', () => {
  it('inserts with default settings and the actor as created_by/updated_by', async () => {
    const client = createMockClient()
    const result = await createKindergarten(client, { name: 'Grădinița Zâna Florilor' }, 'user-1')

    expect(result).toEqual({ success: true, data: sampleRow })
    const insertCall = client.from.mock.results[0].value.insert as ReturnType<typeof vi.fn>
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Grădinița Zâna Florilor',
        created_by: 'user-1',
        updated_by: 'user-1',
        settings: { timezone: 'Europe/Bucharest', default_locale: 'ro', working_hours: { start: '07:30', end: '18:00' } },
      }),
    )
  })
})

describe('updateKindergartenDetails', () => {
  it('updates the details fields and updated_by', async () => {
    const client = createMockClient()
    const result = await updateKindergartenDetails(client, 'kg-1', { name: 'New Name' }, 'user-2')

    expect(result).toEqual({ success: true, data: sampleRow })
    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name', updated_by: 'user-2' }))
  })
})

describe('updateKindergartenSettings', () => {
  it('writes settings as a single jsonb object', async () => {
    const client = createMockClient()
    const result = await updateKindergartenSettings(
      client,
      'kg-1',
      { timezone: 'Europe/Bucharest', defaultLocale: 'en', workingHoursStart: '08:00', workingHoursEnd: '17:00' },
      'user-2',
    )

    expect(result).toEqual({ success: true, data: sampleRow })
    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: { timezone: 'Europe/Bucharest', default_locale: 'en', working_hours: { start: '08:00', end: '17:00' } },
        updated_by: 'user-2',
      }),
    )
  })
})

describe('setKindergartenStatus', () => {
  it('updates only status and updated_by', async () => {
    const client = createMockClient()
    const result = await setKindergartenStatus(client, 'kg-1', 'suspended', 'user-2')

    expect(result).toEqual({ success: true, data: sampleRow })
    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith({ status: 'suspended', updated_by: 'user-2' })
  })
})
