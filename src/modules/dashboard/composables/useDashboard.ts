import { computed } from 'vue'
import { useDashboardStore } from '../stores/dashboard.store'

export function useDashboard() {
  const store = useDashboardStore()
  return {
    stats:       computed(() => store.stats),
    groups:      computed(() => store.groups),
    activity:    computed(() => store.activity),
    staffOnDuty: computed(() => store.staffOnDuty),
    loading:     computed(() => store.loading),
    error:       computed(() => store.error),
    fetchAll:    (kindergartenId: string) => store.fetchAll(kindergartenId),
  }
}
