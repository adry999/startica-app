import { storeToRefs } from 'pinia'
import type { ExpenseInput } from '~/shared/schemas/expense.schema'
import type { ExpenseStatus } from '../types/expenses.types'
import { useActorStore } from '@shared/session/actor.store'
import { useExpensesStore } from '../stores/expenses.store'

export function useExpenses() {
  const expensesStore = useExpensesStore()
  const actorStore = useActorStore()

  async function fetchAll(kindergartenId: string, status?: ExpenseStatus) {
    return expensesStore.fetchAll(kindergartenId, status)
  }

  async function fetchSummary(kindergartenId: string) {
    return expensesStore.fetchSummary(kindergartenId)
  }

  async function create(input: ExpenseInput) {
    const userId = actorStore.actorId
    if (!userId) return false
    return expensesStore.create(input, userId)
  }

  async function approve(id: string) {
    const userId = actorStore.actorId
    if (!userId) return false
    return expensesStore.approve(id, userId)
  }

  async function reject(id: string, reason: string) {
    const userId = actorStore.actorId
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
