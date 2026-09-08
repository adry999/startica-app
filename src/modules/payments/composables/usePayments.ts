/* @ts-ignore — Payments module. */
import { usePaymentsStore } from '../stores/payments.store'
import { useAuthStore } from '~/modules/auth/stores/auth.store'

export function usePayments() {
  const paymentsStore = usePaymentsStore()
  const authStore = useAuthStore()

  async function fetchByInvoice(kindergartenId: string, invoiceId: string) {
    return paymentsStore.fetchByInvoice(kindergartenId, invoiceId)
  }

  async function create(input: { kindergartenId: string; invoiceId: string; amount: number; paidDate: string; method: string; referenceNumber?: string | null; notes?: string | null }) {
    const userId = authStore.user?.id
    if (!userId) return false
    return paymentsStore.create(input, userId)
  }

  async function confirm(id: string) {
    const userId = authStore.user?.id
    if (!userId) return false
    return paymentsStore.confirm(id, userId)
  }

  return {
    items: paymentsStore.items,
    loading: paymentsStore.loading,
    error: paymentsStore.error,
    totalConfirmed: paymentsStore.totalConfirmed,
    fetchByInvoice,
    create,
    confirm,
  }
}
