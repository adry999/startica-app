import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ExpenseInput } from '~/shared/schemas/expense.schema'
import type { Expense, ExpenseStatus, ExpenseSummary } from '../types/expenses.types'
import * as service from '../services/expenses.service'
import { useSupabaseClient } from '~/core/supabase/client'

export const useExpensesStore = defineStore('expenses', () => {
  const client = useSupabaseClient()
  const items = ref<Expense[]>([])
  const summary = ref<ExpenseSummary | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAll(kindergartenId: string, status?: ExpenseStatus) {
    loading.value = true
    error.value = null
    try {
      const result = await service.listExpenses(client, kindergartenId, status)
      if (result.success) {
        items.value = result.data
        return true
      }
      error.value = result.error
      return false
    } finally {
      loading.value = false
    }
  }

  async function fetchSummary(kindergartenId: string) {
    loading.value = true
    error.value = null
    try {
      const result = await service.getSummary(client, kindergartenId)
      if (result.success) {
        summary.value = result.data
        return true
      }
      error.value = result.error
      return false
    } finally {
      loading.value = false
    }
  }

  async function create(input: ExpenseInput, userId: string) {
    loading.value = true
    error.value = null
    try {
      const result = await service.createExpense(client, input, userId)
      if (result.success) {
        items.value.push(result.data)
        await fetchSummary(input.kindergartenId)
        return true
      }
      error.value = result.error
      return false
    } finally {
      loading.value = false
    }
  }

  async function approve(id: string, userId: string) {
    loading.value = true
    error.value = null
    try {
      const result = await service.approveExpense(client, id, userId)
      if (result.success) {
        const idx = items.value.findIndex(e => e.id === id)
        if (idx >= 0) items.value[idx] = result.data
        return true
      }
      error.value = result.error
      return false
    } finally {
      loading.value = false
    }
  }

  async function reject(id: string, reason: string, userId: string) {
    loading.value = true
    error.value = null
    try {
      const result = await service.rejectExpense(client, id, reason, userId)
      if (result.success) {
        const idx = items.value.findIndex(e => e.id === id)
        if (idx >= 0) items.value[idx] = result.data
        return true
      }
      error.value = result.error
      return false
    } finally {
      loading.value = false
    }
  }

  const draftCount = computed(() => items.value.filter(e => e.status === 'draft').length)
  const approvedTotal = computed(() => items.value.filter(e => e.status === 'approved').reduce((sum, e) => sum + e.amount, 0))

  return { items, summary, loading, error, draftCount, approvedTotal, fetchAll, fetchSummary, create, approve, reject }
})
