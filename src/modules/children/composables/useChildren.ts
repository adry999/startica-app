import { computed } from 'vue'
import { useChildrenStore } from '../stores/children.store'

export function useChildren() {
  const store = useChildrenStore()
  return {
    items:    computed(() => store.items),
    loading:  computed(() => store.loading),
    error:    computed(() => store.error),
    fetchAll: (kindergartenId: string) => store.fetchAll(kindergartenId),
    create:   (input: Parameters<typeof store.create>[0]) => store.create(input),
    update:   (id: string, input: Parameters<typeof store.update>[1]) => store.update(id, input),
    setStatus: (id: string, status: Parameters<typeof store.setStatus>[1]) => store.setStatus(id, status),
  }
}
