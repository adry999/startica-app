import { inject, type InjectionKey } from 'vue'
import type { PaymentsDependencies } from './types/payments.types'

export const paymentsDependenciesKey: InjectionKey<PaymentsDependencies> = Symbol('paymentsDependencies')

export function injectPaymentsDependencies(): PaymentsDependencies {
  const dependencies = inject(paymentsDependenciesKey)
  if (!dependencies) {
    throw new Error('Payments dependencies are missing. Provide them in src/plugins/module-dependencies.ts.')
  }
  return dependencies
}
