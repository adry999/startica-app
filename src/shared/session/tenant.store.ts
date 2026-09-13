import { defineStore } from 'pinia'

export const useTenantStore = defineStore('tenant', {
  state: () => ({
    selectedKindergartenId: null as string | null,
  }),

  actions: {
    selectKindergarten(id: string) {
      this.selectedKindergartenId = id
    },

    autoSelectFirst(firstKindergartenId: string) {
      if (!this.selectedKindergartenId) {
        this.selectedKindergartenId = firstKindergartenId
      }
    },
  },
})
