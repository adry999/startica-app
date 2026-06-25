import { defineStore } from 'pinia'

export const useTenantStore = defineStore('tenant', {
  state: () => ({
    selectedKindergartenId: 'ALL' as string | 'ALL',
  }),

  actions: {
    selectKindergarten(id: string | 'ALL') {
      this.selectedKindergartenId = id
    },
  },
})
