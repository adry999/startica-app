import { computed } from 'vue'
import { useGroupsStore } from '../stores/groups.store'

export function useGroups() {
  const store = useGroupsStore()
  return {
    items:   computed(() => store.items),
    loading: computed(() => store.loading),
    error:   computed(() => store.error),
    fetchAll: (kindergartenId: string) => store.fetchAll(kindergartenId),
    create:   (input: Parameters<typeof store.create>[0]) => store.create(input),
    update:   (id: string, input: Parameters<typeof store.update>[1]) => store.update(id, input),
    archive:  (id: string) => store.archive(id),
    restore:  (id: string) => store.restore(id),
  }
}
