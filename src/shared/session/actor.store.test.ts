import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useActorStore } from './actor.store'
import type { Actor } from './actor.types'

const admin: Actor = { id: 'user-1', email: 'a@b.com', fullName: 'A B', role: 'admin', avatarUrl: null, status: 'active' }

describe('useActorStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('has no signed-in actor until auth sets one', () => {
    const store = useActorStore()

    expect(store.isSignedIn).toBe(false)
    expect(store.actorId).toBeNull()
    expect(store.role).toBeNull()
  })

  it('exposes the id and role of the signed-in actor', () => {
    const store = useActorStore()

    store.setActor(admin)

    expect(store.isSignedIn).toBe(true)
    expect(store.actorId).toBe('user-1')
    expect(store.role).toBe('admin')
  })

  it('updates the display profile without touching identity or role', () => {
    const store = useActorStore()
    store.setActor(admin)

    store.updateProfile({ fullName: 'Ana Pop', avatarUrl: 'https://cdn/avatar.png' })

    expect(store.actor).toEqual({ ...admin, fullName: 'Ana Pop', avatarUrl: 'https://cdn/avatar.png' })
  })

  it('ignores a profile update when nobody is signed in', () => {
    const store = useActorStore()

    store.updateProfile({ fullName: 'Ana Pop' })

    expect(store.actor).toBeNull()
  })

  it('forgets identity and module grants on clear', () => {
    const store = useActorStore()
    store.setActor(admin)
    store.setModuleGrants([{ kindergartenId: 'kg-1', moduleKey: 'pool' }])

    store.clear()

    expect(store.actor).toBeNull()
    expect(store.moduleGrants).toEqual([])
  })
})
