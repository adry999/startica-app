import { useSupabaseClient } from '@core/supabase/client'
import { useAuthStore } from '@modules/auth'
import { billingDependenciesKey, createBillingService } from '@modules/billing'
import { createPaymentsService, paymentsDependenciesKey } from '@modules/payments'

// Composition root: the only place that knows which module implements another
// module's port. Runs per request on the server, so no client is shared across users.
export default defineNuxtPlugin({
  name: 'module-dependencies',
  setup(nuxtApp) {
    const client = useSupabaseClient()
    const authStore = useAuthStore()
    const readCurrentActorId = () => authStore.user?.id ?? null
    const billingService = createBillingService(client)

    nuxtApp.vueApp.provide(billingDependenciesKey, { billingService, readCurrentActorId })
    nuxtApp.vueApp.provide(paymentsDependenciesKey, {
      paymentsService: createPaymentsService(client),
      listPayableInvoices: kindergartenId => billingService.listPayableInvoices(kindergartenId),
      readCurrentActorId,
    })
  },
})
