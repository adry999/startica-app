import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const service = vi.hoisted(() => ({
  listByGroup: vi.fn(),
  listByDate: vi.fn(),
  markAttendance: vi.fn(),
  markGroupAttendance: vi.fn(),
}))

vi.mock('~/core/supabase/client', () => ({ useSupabaseClient: vi.fn(() => ({})) }))
vi.mock('../services/attendance.service', () => service)

import { useActorStore } from '@shared/session/actor.store'
import { useAttendanceStore } from './attendance.store'

describe('attendance store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    useActorStore().setActor({ id: 'user-1', email: 'e@b.com', fullName: 'Educator', role: 'educator', avatarUrl: null, status: 'active' })
  })

  it('loads records for a directly selected group', async () => {
    service.listByGroup.mockResolvedValue({ success: true, data: [{
      id: 'attendance-1', child_id: 'child-1', date: '2026-09-09', status: 'present',
      marked_by: 'user-1', notes: null,
    }] })
    const store = useAttendanceStore()

    await expect(store.fetchByGroup('group-1', '2026-09-09')).resolves.toBe(true)
    expect(store.records).toEqual([expect.objectContaining({ childId: 'child-1', status: 'present' })])
  })

  it('returns false and does not report a bulk success when the bulk service fails', async () => {
    service.markGroupAttendance.mockResolvedValue({ success: false, error: 'write_failed' })
    const store = useAttendanceStore()

    await expect(store.markGroupBulk('kg-1', 'group-1', '2026-09-09', ['child-1'], 'present')).resolves.toBe(false)
    expect(service.listByGroup).not.toHaveBeenCalled()
    expect(store.error).toBe('write_failed')
  })

  it('does not apply a write that finishes after the active selection is cleared', async () => {
    let resolveWrite: (value: unknown) => void = () => {}
    service.markAttendance.mockReturnValue(new Promise(resolve => { resolveWrite = resolve }))
    const store = useAttendanceStore()

    const marking = store.markAttendance('kg-1', 'child-1', '2026-09-09', 'present', 'group-1')
    store.clear()
    resolveWrite({ success: true, data: {
      id: 'attendance-1', child_id: 'child-1', date: '2026-09-09', status: 'present', marked_by: 'user-1', notes: null,
    } })

    await expect(marking).resolves.toBe(false)
    expect(store.records).toEqual([])
  })
})
