import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTenantStore } from './tenant.store'

describe('useTenantStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults to ALL', () => {
    const store = useTenantStore()
    expect(store.selectedKindergartenId).toBe('ALL')
  })

  it('selectKindergarten updates the selection', () => {
    const store = useTenantStore()
    store.selectKindergarten('11111111-1111-1111-1111-111111111111')
    expect(store.selectedKindergartenId).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('selectKindergarten can switch back to ALL', () => {
    const store = useTenantStore()
    store.selectKindergarten('11111111-1111-1111-1111-111111111111')
    store.selectKindergarten('ALL')
    expect(store.selectedKindergartenId).toBe('ALL')
  })
})
