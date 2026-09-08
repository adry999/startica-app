/* @ts-ignore — Billing is deferred (Should Have, not V1). */
import { useBillingStore } from '../stores/billing.store'
import { useAuthStore } from '~/modules/auth/stores/auth.store'

export function useBilling() {
  const billingStore = useBillingStore()
  const authStore = useAuthStore()

  async function fetchAll(kindergartenId: string) {
    return billingStore.fetchAll(kindergartenId)
  }

  async function fetchSummary(kindergartenId: string) {
    return billingStore.fetchSummary(kindergartenId)
  }

  async function create(input: { kindergartenId: string; childId: string; amount: number; dueDate: string; notes?: string | null }) {
    const userId = authStore.user?.id
    if (!userId) return false
    return billingStore.create(input, userId)
  }

  async function update(id: string, input: { amount?: number; dueDate?: string; status?: 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled'; paidAt?: string | null; notes?: string | null }) {
    const userId = authStore.user?.id
    if (!userId) return false
    return billingStore.update(id, input, userId)
  }

  async function markAsPaid(id: string) {
    const userId = authStore.user?.id
    if (!userId) return false
    return billingStore.markAsPaid(id, userId)
  }

  return {
    items: billingStore.items,
    summary: billingStore.summary,
    loading: billingStore.loading,
    error: billingStore.error,
    pendingCount: billingStore.pendingCount,
    fetchAll,
    fetchSummary,
    create,
    update,
    markAsPaid,
  }
}
