import { getActivePinia, type Pinia } from 'pinia'

type RegisteredStore = {
  $dispose: () => void
}

/**
 * Clears every instantiated application store except auth.
 *
 * Pinia exposes `state` publicly, but not a public iterator for instantiated
 * stores. The private registry is used only to find those stores; deleting
 * their public state and disposing them means both Options and Setup stores
 * are recreated from their initial state on their next use.
 */
export function resetSessionStores(pinia: Pinia | undefined = getActivePinia() ?? undefined) {
  if (!pinia) return

  const registeredStores = (pinia as Pinia & { _s: Map<string, RegisteredStore> })._s

  for (const [storeId, store] of registeredStores) {
    if (storeId === 'auth') continue

    store.$dispose()
    Reflect.deleteProperty(pinia.state.value, storeId)
  }
}
