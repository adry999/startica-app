import { describe, expect, it } from 'vitest'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { resetSessionStores } from './session-reset'

describe('resetSessionStores', () => {
  it('removes tenant and business state for both Options and Setup stores', () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const useTenantStore = defineStore('tenant', {
      state: () => ({ selectedKindergartenId: null as string | null }),
    })
    const useBusinessStore = defineStore('business', () => {
      const items = ref<string[]>([])
      return { items }
    })
    const useAuthStore = defineStore('auth', {
      state: () => ({ userId: null as string | null }),
    })
    const useActorStore = defineStore('actor', {
      state: () => ({ actorId: null as string | null }),
    })

    useTenantStore().selectedKindergartenId = 'tenant-a'
    useBusinessStore().items = ['child-a']
    useAuthStore().userId = 'user-a'
    const actorStore = useActorStore()
    actorStore.actorId = 'user-a'

    resetSessionStores(pinia)

    expect(pinia.state.value.tenant).toBeUndefined()
    expect(pinia.state.value.business).toBeUndefined()
    expect(useTenantStore().selectedKindergartenId).toBeNull()
    expect(useBusinessStore().items).toEqual([])
    expect(useAuthStore().userId).toBe('user-a')
    expect(useActorStore()).toBe(actorStore)
    expect(actorStore.actorId).toBe('user-a')
  })
})
