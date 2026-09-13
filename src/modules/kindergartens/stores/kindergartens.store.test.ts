import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('~/core/supabase/client', () => ({
  useSupabaseClient: () => ({}),
}))

vi.mock('../services/kindergartens.service')

import { useKindergartensStore } from './kindergartens.store'
import { useActorStore } from '@shared/session/actor.store'
import * as kindergartensService from '../services/kindergartens.service'

const sampleRow = {
  id: 'kg-1',
  name: 'Grădinița Zâna Florilor',
  address: null,
  city: null,
  phone: null,
  logo_url: null,
  status: 'active' as const,
  settings: { timezone: 'Europe/Bucharest', default_locale: 'ro', working_hours: { start: '07:30', end: '18:00' } },
  created_at: '2026-06-24T00:00:00Z',
  updated_at: '2026-06-24T00:00:00Z',
  created_by: 'user-1',
  updated_by: 'user-1',
  deleted_at: null,
}

describe('useKindergartensStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    useActorStore().setActor({ id: 'user-1', email: 'a@b.com', fullName: 'A B', role: 'super_admin', avatarUrl: null, status: 'active' })
  })

  it('fetchAll loads and maps the list', async () => {
    vi.mocked(kindergartensService.listKindergartens).mockResolvedValue({ success: true, data: [sampleRow] })

    const store = useKindergartensStore()
    await store.fetchAll()

    expect(store.items).toEqual([
      {
        id: 'kg-1',
        name: 'Grădinița Zâna Florilor',
        address: null,
        city: null,
        phone: null,
        status: 'active',
        settings: { timezone: 'Europe/Bucharest', defaultLocale: 'ro', workingHours: { start: '07:30', end: '18:00' } },
        createdAt: '2026-06-24T00:00:00Z',
      },
    ])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('fetchAll captures the error and leaves items empty on failure', async () => {
    vi.mocked(kindergartensService.listKindergartens).mockResolvedValue({ success: false, error: 'boom' })

    const store = useKindergartensStore()
    await store.fetchAll()

    expect(store.items).toEqual([])
    expect(store.error).toBe('boom')
  })

  it('create calls the service with the current user as actor and appends the result', async () => {
    vi.mocked(kindergartensService.createKindergarten).mockResolvedValue({ success: true, data: sampleRow })

    const store = useKindergartensStore()
    const ok = await store.create({ name: 'Grădinița Zâna Florilor' })

    expect(ok).toBe(true)
    expect(kindergartensService.createKindergarten).toHaveBeenCalledWith({}, { name: 'Grădinița Zâna Florilor' }, 'user-1')
    expect(store.items).toHaveLength(1)
  })

  it('setStatus updates the matching item in place', async () => {
    vi.mocked(kindergartensService.listKindergartens).mockResolvedValue({ success: true, data: [sampleRow] })
    vi.mocked(kindergartensService.setKindergartenStatus).mockResolvedValue({
      success: true,
      data: { ...sampleRow, status: 'suspended' },
    })

    const store = useKindergartensStore()
    await store.fetchAll()
    const ok = await store.setStatus('kg-1', 'suspended')

    expect(ok).toBe(true)
    expect(store.items[0].status).toBe('suspended')
  })
})
