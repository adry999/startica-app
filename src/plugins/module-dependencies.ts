import { useSupabaseClient } from '@core/supabase/client'
import { useActorStore } from '@shared/session/actor.store'
import { billingDependenciesKey, createBillingService } from '@modules/billing'
import { createExpensesService, expensesDependenciesKey } from '@modules/expenses'
import { createPaymentsService, paymentsDependenciesKey } from '@modules/payments'

// Composition root: the only place that knows which module implements another
// module's port. Runs per request on the server, so no client is shared across users.
export default defineNuxtPlugin({
  name: 'module-dependencies',
  setup(nuxtApp) {
    const client = useSupabaseClient()
    const actorStore = useActorStore()
    const readCurrentActorId = () => actorStore.actorId
    const billingService = createBillingService(client)

    nuxtApp.vueApp.provide(billingDependenciesKey, { billingService, readCurrentActorId })
    nuxtApp.vueApp.provide(expensesDependenciesKey, { expensesService: createExpensesService(client), readCurrentActorId })
    nuxtApp.vueApp.provide(paymentsDependenciesKey, {
      paymentsService: createPaymentsService(client),
      listPayableInvoices: kindergartenId => billingService.listPayableInvoices(kindergartenId),
      readCurrentActorId,
    })
  },
})
