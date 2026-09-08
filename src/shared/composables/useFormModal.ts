import { reactive, ref } from 'vue'

export function useFormModal<T extends Record<string, any>>(template: T) {
  const isOpen = ref(false)
  const state = reactive<any>({})
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
