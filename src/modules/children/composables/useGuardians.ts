import { computed } from 'vue'
import { useGuardiansStore } from '../stores/guardians.store'

export function useGuardians() {
  const store = useGuardiansStore()
  return {
    items:        computed(() => store.items),
    loading:      computed(() => store.loading),
    error:        computed(() => store.error),
    fetchForChild: (childId: string) => store.fetchForChild(childId),
    create:        (input: Parameters<typeof store.create>[0]) => store.create(input),
    update:        (id: string, input: Parameters<typeof store.update>[1]) => store.update(id, input),
    remove:        (id: string) => store.remove(id),
  }
}
