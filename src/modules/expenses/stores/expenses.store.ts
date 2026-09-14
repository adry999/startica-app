import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createLatestRequestGuard } from '@core/async/latest-request'
import { sessionExpiredError, type AppError } from '@core/errors/app-error'
import type { ExpenseInput } from '@shared/schemas/expense.schema'
import type { Result } from '@shared/types/result'
import type { ScreenStatus } from '@shared/types/screen-status'
import { injectExpensesDependencies } from '../expenses.dependencies'
import type { Expense, ExpenseDecision, ExpenseSummary } from '../types/expenses.types'

export const useExpensesStore = defineStore('expenses', () => {
  const { expensesService, readCurrentActorId } = injectExpensesDependencies()
  const expenseRequests = createLatestRequestGuard()
  const summaryRequests = createLatestRequestGuard()

  const expenses = ref<Expense[]>([])
  const summary = ref<ExpenseSummary | null>(null)
  const isSummaryOutdated = ref(false)
  const loadedKindergartenId = ref<string | null>(null)
  const loadPhase = ref<'loading' | 'loaded' | 'failed'>('loading')
  const loadError = ref<AppError | null>(null)
  const decidingExpenseIds = ref<string[]>([])
  const isRecordingExpense = ref(false)

  const status = computed<ScreenStatus>(() => {
    if (loadPhase.value !== 'loaded') return loadPhase.value
    return expenses.value.length > 0 ? 'ready' : 'empty'
  })

  const draftCount = computed(() => summary.value?.draftCount ?? 0)

  function failLoad(error: AppError): false {
    loadError.value = error
    loadPhase.value = 'failed'
    return false
  }

  async function loadExpenses(kindergartenId: string): Promise<boolean> {
    const request = expenseRequests.begin()
    summaryRequests.supersede()
    if (loadedKindergartenId.value !== kindergartenId) {
      expenses.value = []
      summary.value = null
      loadedKindergartenId.value = kindergartenId
    }
    loadPhase.value = 'loading'
    loadError.value = null

    const [expensesResult, summaryResult] = await Promise.all([
      expensesService.listExpenses(kindergartenId),
      expensesService.getSummary(kindergartenId),
    ])
    if (!request.isLatest()) return false
    if (!expensesResult.success) return failLoad(expensesResult.error)
    if (!summaryResult.success) return failLoad(summaryResult.error)

    expenses.value = expensesResult.data
    summary.value = summaryResult.data
    isSummaryOutdated.value = false
    loadPhase.value = 'loaded'
    return true
  }

  async function refreshSummary(kindergartenId: string) {
    const request = summaryRequests.begin()
    const summaryResult = await expensesService.getSummary(kindergartenId)
    if (!request.isLatest() || loadedKindergartenId.value !== kindergartenId) return
    // The expense change already succeeded; a failed refresh flags the totals instead of failing it.
    if (!summaryResult.success) {
      isSummaryOutdated.value = true
      return
    }
    summary.value = summaryResult.data
    isSummaryOutdated.value = false
  }

  async function recordExpense(input: ExpenseInput): Promise<Result<Expense, AppError>> {
    const actorId = readCurrentActorId()
    if (!actorId) return { success: false, error: sessionExpiredError }

    isRecordingExpense.value = true
    try {
      const result = await expensesService.recordExpense(input, actorId)
      if (result.success && loadedKindergartenId.value === result.data.kindergartenId) {
        expenses.value = [result.data, ...expenses.value]
        await refreshSummary(result.data.kindergartenId)
      }
      return result
    }
    finally {
      isRecordingExpense.value = false
    }
  }

  async function decideExpense(
    expenseId: string,
    applyDecision: (decision: ExpenseDecision) => Promise<Result<Expense, AppError>>,
  ): Promise<Result<Expense, AppError>> {
    const actorId = readCurrentActorId()
    const kindergartenId = loadedKindergartenId.value
    if (!actorId) return { success: false, error: sessionExpiredError }
    if (!kindergartenId) return { success: false, error: { kind: 'refused', reason: 'not_found' } }

    decidingExpenseIds.value = [...decidingExpenseIds.value, expenseId]
    try {
      const result = await applyDecision({ expenseId, kindergartenId, actorId })
      if (result.success && loadedKindergartenId.value === kindergartenId) {
        expenses.value = expenses.value.map(expense => (expense.id === expenseId ? result.data : expense))
        await refreshSummary(kindergartenId)
      }
      return result
    }
    finally {
      decidingExpenseIds.value = decidingExpenseIds.value.filter(id => id !== expenseId)
    }
  }

  function approveExpense(expenseId: string): Promise<Result<Expense, AppError>> {
    return decideExpense(expenseId, decision => expensesService.approveExpense(decision))
  }

  function rejectExpense(expenseId: string, reason: string): Promise<Result<Expense, AppError>> {
    return decideExpense(expenseId, decision => expensesService.rejectExpense({ ...decision, reason }))
  }

  function isDeciding(expenseId: string): boolean {
    return decidingExpenseIds.value.includes(expenseId)
  }

  return {
    expenses,
    summary,
    isSummaryOutdated,
    loadedKindergartenId,
    loadPhase,
    loadError,
    decidingExpenseIds,
    isRecordingExpense,
    status,
    draftCount,
    loadExpenses,
    recordExpense,
    approveExpense,
    rejectExpense,
    isDeciding,
  }
})
