import { storeToRefs } from 'pinia'
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

  // storeToRefs keeps state reactive when destructured; reading
  // `billingStore.items` directly would hand out a detached snapshot.
  const { items, summary, loading, error, pendingCount } = storeToRefs(billingStore)

  return {
    items,
    summary,
    loading,
    error,
    pendingCount,
    fetchAll,
    fetchSummary,
    create,
    update,
    markAsPaid,
  }
}
