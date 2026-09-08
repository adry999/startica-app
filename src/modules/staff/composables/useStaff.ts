import { computed } from 'vue'
import { useStaffStore } from '../stores/staff.store'
import type { InviteStaffInput, UpdateStaffInput } from '~/shared/schemas/staff.schema'
import type { ModuleKey } from '~/modules/auth/types/moduleAccess.types'

export function useStaff() {
  const store = useStaffStore()

  return {
    items: computed(() => store.items),
    loading: computed(() => store.loading),
    error: computed(() => store.error),
    fetchAll: (kindergartenId: string) => store.fetchAll(kindergartenId),
    invite: (input: InviteStaffInput) => store.invite(input),
    updateProfile: (userId: string, data: UpdateStaffInput) => store.updateProfile(userId, data),
    setStatus: (userId: string, status: 'active' | 'inactive') => store.setStatus(userId, status),
    remove: (userId: string, kindergartenId: string) => store.remove(userId, kindergartenId),
    fetchAssignedKindergartens: (userId: string) => store.fetchAssignedKindergartens(userId),
    fetchUserModules: (userId: string, kindergartenId: string) => store.fetchUserModules(userId, kindergartenId),
    saveModuleGrants: (userId: string, kindergartenId: string, desiredKeys: ModuleKey[]) =>
      store.saveModuleGrants(userId, kindergartenId, desiredKeys),
  }
}
