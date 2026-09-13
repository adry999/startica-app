import { inject, type InjectionKey } from 'vue'
import type { BillingDependencies } from './types/billing.types'

export const billingDependenciesKey: InjectionKey<BillingDependencies> = Symbol('billingDependencies')

export function injectBillingDependencies(): BillingDependencies {
  const dependencies = inject(billingDependenciesKey)
  if (!dependencies) {
    throw new Error('Billing dependencies are missing. Provide them in src/plugins/module-dependencies.ts.')
  }
  return dependencies
}
