/* @ts-ignore — Expenses module. */
import { useExpensesStore } from '../stores/expenses.store'
import { useAuthStore } from '~/modules/auth/stores/auth.store'

export function useExpenses() {
  const expensesStore = useExpensesStore()
  const authStore = useAuthStore()

  async function fetchAll(kindergartenId: string, status?: string) {
    return expensesStore.fetchAll(kindergartenId, status as any)
  }

  async function fetchSummary(kindergartenId: string) {
    return expensesStore.fetchSummary(kindergartenId)
  }

  async function create(input: { kindergartenId: string; category: string; amount: number; expenseDate: string; description?: string | null }) {
    const userId = authStore.user?.id
    if (!userId) return false
    return expensesStore.create(input, userId)
  }

  async function approve(id: string) {
    const userId = authStore.user?.id
    if (!userId) return false
    return expensesStore.approve(id, userId)
  }

  async function reject(id: string, reason: string) {
    const userId = authStore.user?.id
    if (!userId) return false
    return expensesStore.reject(id, reason, userId)
  }

  return {
    items: expensesStore.items,
    summary: expensesStore.summary,
    loading: expensesStore.loading,
    error: expensesStore.error,
    draftCount: expensesStore.draftCount,
    approvedTotal: expensesStore.approvedTotal,
    fetchAll,
    fetchSummary,
    create,
    approve,
    reject,
  }
}
