import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTenantStore } from './tenant.store'

const KG_A = '11111111-1111-4111-8111-111111111111'
const KG_B = '22222222-2222-4222-8222-222222222222'

describe('useTenantStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // Single-kindergarten mode: there is no 'ALL' selection any more. The store
  // starts empty and admin.vue fills it via autoSelectFirst.
  it('starts with no kindergarten selected', () => {
    const store = useTenantStore()
    expect(store.selectedKindergartenId).toBeNull()
  })

  it('selectKindergarten updates the selection', () => {
    const store = useTenantStore()
    store.selectKindergarten(KG_A)
    expect(store.selectedKindergartenId).toBe(KG_A)
  })

  it('selectKindergarten can switch to another kindergarten', () => {
    const store = useTenantStore()
    store.selectKindergarten(KG_A)
    store.selectKindergarten(KG_B)
    expect(store.selectedKindergartenId).toBe(KG_B)
  })

  it('autoSelectFirst fills an empty selection', () => {
    const store = useTenantStore()
    store.autoSelectFirst(KG_A)
    expect(store.selectedKindergartenId).toBe(KG_A)
  })

  it('autoSelectFirst leaves an existing selection alone', () => {
    const store = useTenantStore()
    store.selectKindergarten(KG_B)
    store.autoSelectFirst(KG_A)
    expect(store.selectedKindergartenId).toBe(KG_B)
  })
})
