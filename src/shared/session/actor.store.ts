import { defineStore } from 'pinia'
import type { Actor, ActorProfileChange, ModuleGrant } from './actor.types'

// Who is signed in. Only the auth module writes identity and grants; every other
// module reads them here. resetSessionStores keeps this store: auth clears it explicitly.
export const useActorStore = defineStore('actor', {
  state: () => ({
    actor: null as Actor | null,
    moduleGrants: [] as ModuleGrant[],
  }),

  getters: {
    actorId: state => state.actor?.id ?? null,
    role: state => state.actor?.role ?? null,
    isSignedIn: state => state.actor !== null,
  },

  actions: {
    setActor(actor: Actor) {
      this.actor = actor
    },

    setModuleGrants(moduleGrants: ModuleGrant[]) {
      this.moduleGrants = moduleGrants
    },

    updateProfile(change: ActorProfileChange) {
      if (!this.actor) return
      this.actor = { ...this.actor, ...change }
    },

    clear() {
      this.actor = null
      this.moduleGrants = []
    },
  },
})
