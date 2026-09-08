import type { Result } from '~/shared/types/result'

export interface StoreActionContext {
  loading: boolean
  error: string | null
}

// The type parameter sits on the returned function rather than the factory, so
// each call infers its own payload type from `fn`. Binding it to the factory
// meant a bare `useStoreAction(this)` fixed T to its default for every
// subsequent call, which is why it used to be `any`.
export function useStoreAction(context: StoreActionContext) {
  return async <T>(
    fn: () => Promise<Result<T>>,
    onSuccess?: (data: T) => void,
  ): Promise<boolean> => {
    context.loading = true
    context.error = null
    try {
      const result = await fn()
      if (!result.success) {
        context.error = result.error
        return false
      }
      onSuccess?.(result.data)
      return true
    } finally {
      context.loading = false
    }
  }
}
