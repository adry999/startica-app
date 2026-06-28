import { computed } from 'vue'
import { useKindergartensStore } from '../stores/kindergartens.store'

export function useKindergartens() {
  const store = useKindergartensStore()

  return {
    items: computed(() => store.items),
    loading: computed(() => store.loading),
    error: computed(() => store.error),
    fetchAll: () => store.fetchAll(),
    create: (details: { name: string; address?: string; city?: string; phone?: string }) => store.create(details),
    updateDetails: (id: string, details: { name: string; address?: string; city?: string; phone?: string }) =>
      store.updateDetails(id, details),
    updateSettings: (
      id: string,
      settings: { timezone: string; defaultLocale: 'ro' | 'en'; workingHoursStart: string; workingHoursEnd: string },
    ) => store.updateSettings(id, settings),
    setStatus: (id: string, status: 'active' | 'suspended') => store.setStatus(id, status),
  }
}
