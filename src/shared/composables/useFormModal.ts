import { reactive, ref } from 'vue'

export function useFormModal<T extends Record<string, unknown>>(template: T) {
  const isOpen = ref(false)
  // reactive() unwraps refs in T, which Partial<T> does not model, so the store
  // is kept loose here and re-typed as Partial<T> on the way out.
  const state = reactive<Record<string, unknown>>({})
  const loading = ref(false)

  return {
    get isOpen() { return isOpen.value },
    set isOpen(v) { isOpen.value = v },
    state: state as Partial<T>,
    get loading() { return loading.value },
    set loading(v) { loading.value = v },
    open(data?: T) {
      Object.assign(state, data ?? template)
      isOpen.value = true
    },
    close() {
      isOpen.value = false
    },
    reset(t: T) {
      Object.assign(state, t)
    },
    async submit<R>(fn: (data: Partial<T>) => Promise<R>) {
      loading.value = true
      try {
        return await fn(state as Partial<T>)
      } finally {
        loading.value = false
      }
    },
  }
}
