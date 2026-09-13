// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AttendancePage from './AttendancePage.vue'

const { tenantStore, groupsStore, childrenStore, attendance } = vi.hoisted(() => ({
  tenantStore: { selectedKindergartenId: 'kg-1' as string | null },
  groupsStore: {
  items: [], error: null as string | null,
  fetchAll: vi.fn(), $reset: vi.fn(),
  },
  childrenStore: {
  items: [], error: null as string | null,
  fetchAll: vi.fn(), $reset: vi.fn(),
  },
  attendance: {
  records: { value: [] }, loading: { value: false }, error: { value: null },
  fetchByGroup: vi.fn(), markAttendance: vi.fn(), markGroupBulk: vi.fn(), clear: vi.fn(),
  },
}))

vi.mock('../composables/useAttendance', () => ({ useAttendance: () => attendance }))

vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
vi.stubGlobal('useTenantStore', () => tenantStore)
vi.stubGlobal('useGroupsStore', () => groupsStore)
vi.stubGlobal('useChildrenStore', () => childrenStore)
vi.stubGlobal('useAttendance', () => attendance)
vi.stubGlobal('useLazyAsyncData', (_key: string, handler: () => Promise<boolean>) => {
  void handler()
  return { pending: { value: false, __v_isRef: true }, error: { value: null } }
})

describe('AttendancePage', () => {
  beforeEach(() => {
    tenantStore.selectedKindergartenId = 'kg-1'
    groupsStore.items = []
    groupsStore.error = null
    childrenStore.items = []
    childrenStore.error = null
    vi.clearAllMocks()
    groupsStore.fetchAll.mockResolvedValue(true)
    childrenStore.fetchAll.mockResolvedValue(true)
  })

  it('loads groups and children for the selected kindergarten on direct navigation', async () => {
    mount(AttendancePage, {
      global: { stubs: { UAlert: true } },
    })

    await flushPromises()

    expect(groupsStore.fetchAll).toHaveBeenCalledWith('kg-1')
    expect(childrenStore.fetchAll).toHaveBeenCalledWith('kg-1')
  })
})
