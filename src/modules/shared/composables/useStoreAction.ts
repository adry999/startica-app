import type { Result } from '~/shared/types/result'

export interface StoreActionContext {
  loading: boolean
  error: string | null
}

export function useStoreAction<T>(context: StoreActionContext) {
  return async (
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
