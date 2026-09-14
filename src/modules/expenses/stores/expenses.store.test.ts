import { describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import type { AppError } from '@core/errors/app-error'
import type { ExpenseInput } from '@shared/schemas/expense.schema'
import type { Result } from '@shared/types/result'
import { expensesDependenciesKey } from '../expenses.dependencies'
import type { Expense, ExpensesDependencies, ExpensesService, ExpenseSummary } from '../types/expenses.types'
import { useExpensesStore } from './expenses.store'

const kindergartenA = 'kg-a'
const kindergartenB = 'kg-b'

const draftA: Expense = {
  id: 'expense-a',
  kindergartenId: kindergartenA,
  category: 'supplies',
  amount: 120,
  expenseDate: '2026-09-01',
  description: null,
  status: 'draft',
  approvedBy: null,
  rejectionReason: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  createdBy: 'user-1',
  updatedBy: 'user-1',
}

const expenseB: Expense = { ...draftA, id: 'expense-b', kindergartenId: kindergartenB }

const summaryA: ExpenseSummary = { totalSpent: 120, totalApproved: 0, totalPending: 120, byCategory: { supplies: 120 } }
const refreshedSummary: ExpenseSummary = { totalSpent: 120, totalApproved: 120, totalPending: 0, byCategory: { supplies: 120 } }

const validInput: ExpenseInput = {
  kindergartenId: kindergartenA,
  category: 'supplies',
  amount: 120,
  expenseDate: '2026-09-01',
}

interface ExpensesServiceOverrides {
  listExpenses?: ExpensesService['listExpenses']
  getSummary?: ExpensesService['getSummary']
  recordExpense?: ExpensesService['recordExpense']
  approveExpense?: ExpensesService['approveExpense']
  rejectExpense?: ExpensesService['rejectExpense']
  readCurrentActorId?: () => string | null
}

function createFakeExpensesDependencies(overrides: ExpensesServiceOverrides = {}): ExpensesDependencies {
  return {
    expensesService: {
      listExpenses: overrides.listExpenses
        ?? vi.fn<ExpensesService['listExpenses']>().mockResolvedValue({ success: true, data: [] }),
      getSummary: overrides.getSummary
        ?? vi.fn<ExpensesService['getSummary']>().mockResolvedValue({ success: true, data: summaryA }),
      recordExpense: overrides.recordExpense
        ?? vi.fn<ExpensesService['recordExpense']>().mockResolvedValue({ success: true, data: draftA }),
      approveExpense: overrides.approveExpense
        ?? vi.fn<ExpensesService['approveExpense']>().mockResolvedValue({ success: true, data: { ...draftA, status: 'approved' } }),
      rejectExpense: overrides.rejectExpense
        ?? vi.fn<ExpensesService['rejectExpense']>().mockResolvedValue({ success: true, data: { ...draftA, status: 'rejected' } }),
    },
    readCurrentActorId: overrides.readCurrentActorId ?? vi.fn(() => 'actor-1'),
  }
}

function createExpensesStore(dependencies: ExpensesDependencies) {
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  app.provide(expensesDependenciesKey, dependencies)
  return useExpensesStore(pinia)
}

function listing(expenses: Expense[]) {
  return vi.fn<ExpensesService['listExpenses']>().mockResolvedValue({ success: true, data: expenses })
}

describe('status', () => {
  it('starts loading before any expenses are requested', () => {
    const store = createExpensesStore(createFakeExpensesDependencies())
    expect(store.status).toBe('loading')
  })

  it('is ready with the summary once a kindergarten with expenses has loaded', async () => {
    const store = createExpensesStore(createFakeExpensesDependencies({ listExpenses: listing([draftA]) }))

    await store.loadExpenses(kindergartenA)

    expect(store.status).toBe('ready')
    expect(store.summary).toEqual(summaryA)
    expect(store.draftCount).toBe(1)
  })

  it('is empty once a kindergarten with no expenses has loaded', async () => {
    const store = createExpensesStore(createFakeExpensesDependencies())

    await store.loadExpenses(kindergartenA)

    expect(store.status).toBe('empty')
  })

  it('is failed with loadError set when the summary request fails', async () => {
    const summaryFailure: AppError = { kind: 'network' }
    const store = createExpensesStore(createFakeExpensesDependencies({
      listExpenses: listing([draftA]),
      getSummary: vi.fn<ExpensesService['getSummary']>().mockResolvedValue({ success: false, error: summaryFailure }),
    }))

    await store.loadExpenses(kindergartenA)

    expect(store.status).toBe('failed')
    expect(store.loadError).toEqual(summaryFailure)
  })
})

describe('loadExpenses', () => {
  it('ignores a slow kindergarten-A response that resolves after kindergarten B has loaded', async () => {
    let resolveExpensesA: (result: Result<Expense[], AppError>) => void = () => {}
    const pendingExpensesA = new Promise<Result<Expense[], AppError>>((resolve) => { resolveExpensesA = resolve })
    const listExpenses = vi.fn<ExpensesService['listExpenses']>(async kindergartenId =>
      (kindergartenId === kindergartenA ? pendingExpensesA : { success: true, data: [expenseB] }))
    const store = createExpensesStore(createFakeExpensesDependencies({ listExpenses }))

    const loadingA = store.loadExpenses(kindergartenA)
    await store.loadExpenses(kindergartenB)
    resolveExpensesA({ success: true, data: [draftA] })
    await expect(loadingA).resolves.toBe(false)

    expect(store.loadedKindergartenId).toBe(kindergartenB)
    expect(store.expenses).toEqual([expenseB])
  })

  it('clears the previous tenant\'s expenses as soon as a different kindergarten starts loading', async () => {
    let resolveExpensesB: (result: Result<Expense[], AppError>) => void = () => {}
    const pendingExpensesB = new Promise<Result<Expense[], AppError>>((resolve) => { resolveExpensesB = resolve })
    const listExpenses = vi.fn<ExpensesService['listExpenses']>(async kindergartenId =>
      (kindergartenId === kindergartenA ? { success: true, data: [draftA] } : pendingExpensesB))
    const store = createExpensesStore(createFakeExpensesDependencies({ listExpenses }))
    await store.loadExpenses(kindergartenA)

    const loadingB = store.loadExpenses(kindergartenB)
    expect(store.expenses).toEqual([])
    expect(store.summary).toBeNull()

    resolveExpensesB({ success: true, data: [expenseB] })
    await loadingB
  })
})

describe('recordExpense', () => {
  it('returns refused session_expired without calling the service when nobody is signed in', async () => {
    const recordExpense = vi.fn<ExpensesService['recordExpense']>()
    const store = createExpensesStore(createFakeExpensesDependencies({ readCurrentActorId: () => null, recordExpense }))

    const result = await store.recordExpense(validInput)

    expect(result).toEqual({ success: false, error: { kind: 'refused', reason: 'session_expired' } })
    expect(recordExpense).not.toHaveBeenCalled()
  })

  it('prepends the recorded expense and refreshes the summary', async () => {
    const recorded: Expense = { ...draftA, id: 'expense-new' }
    const getSummary = vi.fn<ExpensesService['getSummary']>().mockResolvedValue({ success: true, data: summaryA })
    const store = createExpensesStore(createFakeExpensesDependencies({
      listExpenses: listing([draftA]),
      getSummary,
      recordExpense: vi.fn<ExpensesService['recordExpense']>().mockResolvedValue({ success: true, data: recorded }),
    }))
    await store.loadExpenses(kindergartenA)
    getSummary.mockResolvedValueOnce({ success: true, data: refreshedSummary })

    const result = await store.recordExpense(validInput)

    expect(result).toEqual({ success: true, data: recorded })
    expect(store.expenses).toEqual([recorded, draftA])
    expect(store.summary).toEqual(refreshedSummary)
  })
})

describe('approveExpense', () => {
  it('approves with the loaded kindergarten and actor, replaces the row and refreshes the summary', async () => {
    const approved: Expense = { ...draftA, status: 'approved', approvedBy: 'actor-9' }
    const approveExpense = vi.fn<ExpensesService['approveExpense']>().mockResolvedValue({ success: true, data: approved })
    const getSummary = vi.fn<ExpensesService['getSummary']>().mockResolvedValue({ success: true, data: summaryA })
    const store = createExpensesStore(createFakeExpensesDependencies({
      listExpenses: listing([draftA]),
      getSummary,
      approveExpense,
      readCurrentActorId: () => 'actor-9',
    }))
    await store.loadExpenses(kindergartenA)
    getSummary.mockResolvedValueOnce({ success: true, data: refreshedSummary })

    const result = await store.approveExpense(draftA.id)

    expect(result).toEqual({ success: true, data: approved })
    expect(approveExpense).toHaveBeenCalledWith({ expenseId: draftA.id, kindergartenId: kindergartenA, actorId: 'actor-9' })
    expect(store.expenses).toEqual([approved])
    expect(store.summary).toEqual(refreshedSummary)
    expect(store.draftCount).toBe(0)
  })

  it('is deciding while the request is in flight and not after it completes', async () => {
    let resolveApproval: (result: Result<Expense, AppError>) => void = () => {}
    const pendingApproval = new Promise<Result<Expense, AppError>>((resolve) => { resolveApproval = resolve })
    const store = createExpensesStore(createFakeExpensesDependencies({
      listExpenses: listing([draftA]),
      approveExpense: vi.fn<ExpensesService['approveExpense']>(() => pendingApproval),
    }))
    await store.loadExpenses(kindergartenA)

    const approving = store.approveExpense(draftA.id)
    expect(store.isDeciding(draftA.id)).toBe(true)

    resolveApproval({ success: true, data: { ...draftA, status: 'approved' } })
    await approving

    expect(store.isDeciding(draftA.id)).toBe(false)
  })

  it('still reports success and flags the totals as outdated when the summary refresh fails', async () => {
    const getSummary = vi.fn<ExpensesService['getSummary']>().mockResolvedValue({ success: true, data: summaryA })
    const store = createExpensesStore(createFakeExpensesDependencies({ listExpenses: listing([draftA]), getSummary }))
    await store.loadExpenses(kindergartenA)
    getSummary.mockResolvedValueOnce({ success: false, error: { kind: 'network' } })

    const result = await store.approveExpense(draftA.id)

    expect(result.success).toBe(true)
    expect(store.isSummaryOutdated).toBe(true)
    expect(store.summary).toEqual(summaryA)
  })
})

describe('rejectExpense', () => {
  it('passes the reason with the loaded kindergarten and actor', async () => {
    const rejectExpense = vi.fn<ExpensesService['rejectExpense']>().mockResolvedValue({ success: true, data: { ...draftA, status: 'rejected' } })
    const store = createExpensesStore(createFakeExpensesDependencies({ listExpenses: listing([draftA]), rejectExpense }))
    await store.loadExpenses(kindergartenA)

    await store.rejectExpense(draftA.id, 'Duplicate receipt')

    expect(rejectExpense).toHaveBeenCalledWith({
      expenseId: draftA.id,
      kindergartenId: kindergartenA,
      actorId: 'actor-1',
      reason: 'Duplicate receipt',
    })
  })

  it('keeps the row unchanged when the database refuses the decision', async () => {
    const refusal: AppError = { kind: 'refused', reason: 'expense_not_draft' }
    const store = createExpensesStore(createFakeExpensesDependencies({
      listExpenses: listing([draftA]),
      rejectExpense: vi.fn<ExpensesService['rejectExpense']>().mockResolvedValue({ success: false, error: refusal }),
    }))
    await store.loadExpenses(kindergartenA)

    const result = await store.rejectExpense(draftA.id, 'Duplicate receipt')

    expect(result).toEqual({ success: false, error: refusal })
    expect(store.expenses).toEqual([draftA])
  })
})
