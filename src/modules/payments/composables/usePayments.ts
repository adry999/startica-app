import { storeToRefs } from 'pinia'
import type { PaymentInput } from '~/shared/schemas/payment.schema'
import { usePaymentsStore } from '../stores/payments.store'
import { useAuthStore } from '~/modules/auth/stores/auth.store'

export function usePayments() {
  const paymentsStore = usePaymentsStore()
  const authStore = useAuthStore()

  async function fetchByInvoice(kindergartenId: string, invoiceId: string) {
    return paymentsStore.fetchByInvoice(kindergartenId, invoiceId)
  }

  async function create(input: PaymentInput) {
    const userId = authStore.user?.id
    if (!userId) return false
    return paymentsStore.create(input, userId)
  }

  async function confirm(id: string) {
    const userId = authStore.user?.id
    if (!userId) return false
    return paymentsStore.confirm(id, userId)
  }

  // storeToRefs keeps state reactive when destructured; reading
  // `paymentsStore.items` directly would hand out a detached snapshot.
  const { items, loading, error, totalConfirmed } = storeToRefs(paymentsStore)

  return {
    items,
    loading,
    error,
    totalConfirmed,
    fetchByInvoice,
    create,
    confirm,
  }
}
