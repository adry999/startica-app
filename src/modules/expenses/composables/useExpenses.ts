import { storeToRefs } from 'pinia'
import type { ExpenseInput } from '~/shared/schemas/expense.schema'
import type { ExpenseStatus } from '../types/expenses.types'
import { useExpensesStore } from '../stores/expenses.store'
import { useAuthStore } from '~/modules/auth/stores/auth.store'

export function useExpenses() {
  const expensesStore = useExpensesStore()
  const authStore = useAuthStore()

  async function fetchAll(kindergartenId: string, status?: ExpenseStatus) {
    return expensesStore.fetchAll(kindergartenId, status)
  }

  async function fetchSummary(kindergartenId: string) {
    return expensesStore.fetchSummary(kindergartenId)
  }

  async function create(input: ExpenseInput) {
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

  // storeToRefs keeps state reactive when destructured; reading
  // `expensesStore.items` directly would hand out a detached snapshot.
  const { items, summary, loading, error, draftCount, approvedTotal } = storeToRefs(expensesStore)

  return {
    items,
    summary,
    loading,
    error,
    draftCount,
    approvedTotal,
    fetchAll,
    fetchSummary,
    create,
    approve,
    reject,
  }
}
