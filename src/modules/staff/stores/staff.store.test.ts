import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('~/core/supabase/client', () => ({
  useSupabaseClient: () => ({}),
}))

vi.mock('../services/staff.service')

import { useStaffStore } from './staff.store'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as staffService from '../services/staff.service'
import type { UserModuleRow } from '../services/staff.service'

const sampleRow = {
  id: 'user-2',
  email: 'maria@example.com',
  full_name: 'Maria Ionescu',
  role: 'admin' as const,
  status: 'active' as const,
  avatar_url: null,
  created_at: '2026-06-24T00:00:00Z',
  updated_at: '2026-06-24T00:00:00Z',
  created_by: 'user-1',
  updated_by: 'user-1',
  deleted_at: null,
}

const sampleMember = {
  id: 'user-2',
  email: 'maria@example.com',
  fullName: 'Maria Ionescu',
  role: 'admin' as const,
  status: 'active' as const,
  avatarUrl: null,
}

describe('useStaffStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ success: true }))
    useAuthStore().user = {
      id: 'user-1',
      email: 'admin@startica.dev',
      fullName: 'Super Admin',
      role: 'super_admin',
      avatarUrl: null,
      status: 'active',
    }
  })

  it('fetchAll loads and maps the list', async () => {
    vi.mocked(staffService.listStaff).mockResolvedValue({ success: true, data: [sampleRow] })

    const store = useStaffStore()
    await store.fetchAll('kg-1')

    expect(store.items).toEqual([sampleMember])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('fetchAll captures the error and leaves items empty on failure', async () => {
    vi.mocked(staffService.listStaff).mockResolvedValue({ success: false, error: 'boom' })

    const store = useStaffStore()
    await store.fetchAll('kg-1')

    expect(store.items).toEqual([])
    expect(store.error).toBe('boom')
  })

  it('invite calls the server route then refreshes the list', async () => {
    vi.mocked(staffService.listStaff).mockResolvedValue({ success: true, data: [sampleRow] })

    const store = useStaffStore()
    const ok = await store.invite({
      email: 'new@example.com',
      fullName: 'Nou Educator',
      role: 'educator',
      kindergartenId: 'kg-1',
    })

    expect(ok).toBe(true)
    expect($fetch).toHaveBeenCalledWith('/api/staff/invite', {
      method: 'POST',
      body: { email: 'new@example.com', fullName: 'Nou Educator', role: 'educator', kindergartenId: 'kg-1' },
    })
    expect(staffService.listStaff).toHaveBeenCalledWith({}, 'kg-1')
  })

  it('updateProfile replaces the matching item in place', async () => {
    vi.mocked(staffService.listStaff).mockResolvedValue({ success: true, data: [sampleRow] })
    vi.mocked(staffService.updateStaffProfile).mockResolvedValue({
      success: true,
      data: { ...sampleRow, full_name: 'Maria I.' },
    })

    const store = useStaffStore()
    await store.fetchAll('kg-1')
    const ok = await store.updateProfile('user-2', { fullName: 'Maria I.' })

    expect(ok).toBe(true)
    expect(store.items[0].fullName).toBe('Maria I.')
  })

  it('setStatus updates the matching item in place', async () => {
    vi.mocked(staffService.listStaff).mockResolvedValue({ success: true, data: [sampleRow] })
    vi.mocked(staffService.setStaffStatus).mockResolvedValue({
      success: true,
      data: { ...sampleRow, status: 'inactive' },
    })

    const store = useStaffStore()
    await store.fetchAll('kg-1')
    const ok = await store.setStatus('user-2', 'inactive')

    expect(ok).toBe(true)
    expect(store.items[0].status).toBe('inactive')
  })

  it('remove calls service with userId + kindergartenId and removes the item', async () => {
    vi.mocked(staffService.listStaff).mockResolvedValue({ success: true, data: [sampleRow] })
    vi.mocked(staffService.removeFromKindergarten).mockResolvedValue({ success: true, data: null })

    const store = useStaffStore()
    await store.fetchAll('kg-1')
    const ok = await store.remove('user-2', 'kg-1')

    expect(ok).toBe(true)
    expect(store.items).toHaveLength(0)
  })
})

describe('staff.store module grants', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ success: true }))
  })

  it('fetchAssignedKindergartens returns the list and clears any prior error', async () => {
    vi.spyOn(staffService, 'listAssignedKindergartens').mockResolvedValue({
      success: true,
      data: [{ id: 'kg-1', name: 'Grădinița 1' }],
    })

    const store = useStaffStore()
    store.error = 'stale_error'
    const result = await store.fetchAssignedKindergartens('user-2')

    expect(result).toEqual([{ id: 'kg-1', name: 'Grădinița 1' }])
    expect(store.error).toBeNull()
  })

  it('fetchAssignedKindergartens sets the store error and returns [] on failure', async () => {
    vi.spyOn(staffService, 'listAssignedKindergartens').mockResolvedValue({
      success: false,
      error: 'list_failed',
    })

    const store = useStaffStore()
    const result = await store.fetchAssignedKindergartens('user-2')

    expect(result).toEqual([])
    expect(store.error).toBe('list_failed')
  })

  it('fetchUserModules returns the mapped keys and clears any prior error', async () => {
    vi.spyOn(staffService, 'listUserModules').mockResolvedValue({
      success: true,
      data: [{ module_key: 'pool' } as unknown as UserModuleRow],
    })

    const store = useStaffStore()
    store.error = 'stale_error'
    const result = await store.fetchUserModules('user-2', 'kg-1')

    expect(result).toEqual(['pool'])
    expect(store.error).toBeNull()
  })

  it('fetchUserModules sets the store error and returns [] on failure', async () => {
    vi.spyOn(staffService, 'listUserModules').mockResolvedValue({
      success: false,
      error: 'list_failed',
    })

    const store = useStaffStore()
    const result = await store.fetchUserModules('user-2', 'kg-1')

    expect(result).toEqual([])
    expect(store.error).toBe('list_failed')
  })

  it('saveModuleGrants grants missing keys and revokes removed keys', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'actor-1', email: 'a@b.com', fullName: 'A', role: 'admin', avatarUrl: null, status: 'active' }

    vi.spyOn(staffService, 'listUserModules').mockResolvedValue({
      success: true,
      data: [
        { module_key: 'pool' } as unknown as UserModuleRow,          // currently: pool
        { module_key: 'payroll_own' } as unknown as UserModuleRow,   // currently: payroll_own
      ],
    })
    const grantSpy = vi.spyOn(staffService, 'grantModule').mockResolvedValue({ success: true, data: {} as unknown as UserModuleRow })
    const revokeSpy = vi.spyOn(staffService, 'revokeModule').mockResolvedValue({ success: true, data: null })

    const store = useStaffStore()
    // desired: pool + payroll_all  → add payroll_all, remove payroll_own
    const ok = await store.saveModuleGrants('user-2', 'kg-1', ['pool', 'payroll_all'])

    expect(ok).toBe(true)
    expect(grantSpy).toHaveBeenCalledWith(expect.anything(), 'user-2', 'kg-1', 'payroll_all', 'actor-1')
    expect(revokeSpy).toHaveBeenCalledWith(expect.anything(), 'user-2', 'kg-1', 'payroll_own')
    expect(grantSpy).not.toHaveBeenCalledWith(expect.anything(), 'user-2', 'kg-1', 'pool', 'actor-1')
  })
})
