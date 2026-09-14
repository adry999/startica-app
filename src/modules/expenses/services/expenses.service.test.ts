import { describe, expect, it } from 'vitest'
import {
  argumentsOf,
  createSupabaseClientFake,
  networkFailureResponse,
  refusalResponse,
  successResponse,
} from '@test-support/supabase-client-fake'
import type { ExpenseInput } from '@shared/schemas/expense.schema'
import { createExpensesService } from './expenses.service'

const kindergartenId = '3f1a9c2e-5b7d-4e8a-9c1f-2a4b6d8e0f13'
const actorId = 'user-1'

const expenseRow = {
  id: 'expense-1',
  kindergarten_id: kindergartenId,
  category: 'supplies',
  amount: '120.00',
  expense_date: '2026-09-01',
  description: null,
  status: 'draft',
  approved_by: null,
  rejection_reason: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  created_by: actorId,
  updated_by: actorId,
  deleted_at: null,
}

const validInput: ExpenseInput = {
  kindergartenId,
  category: 'supplies',
  amount: 120,
  expenseDate: '2026-09-01',
}

describe('listExpenses', () => {
  it('scopes the query by kindergarten and excludes soft-deleted rows', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse([expenseRow]))
    const service = createExpensesService(client)

    await service.listExpenses(kindergartenId)

    const expensesQuery = queries.find(query => query.target === 'expenses')
    expect(argumentsOf(expensesQuery, 'eq')).toEqual([['kindergarten_id', kindergartenId]])
    expect(argumentsOf(expensesQuery, 'is')).toEqual([['deleted_at', null]])
  })

  it('maps snake_case rows and coerces the numeric amount', async () => {
    const { client } = createSupabaseClientFake(() => successResponse([expenseRow]))
    const service = createExpensesService(client)

    const result = await service.listExpenses(kindergartenId)

    expect(result).toEqual({
      success: true,
      data: [{
        id: 'expense-1',
        kindergartenId,
        category: 'supplies',
        amount: 120,
        expenseDate: '2026-09-01',
        description: null,
        status: 'draft',
        approvedBy: null,
        rejectionReason: null,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
        createdBy: actorId,
        updatedBy: actorId,
      }],
    })
  })
})

function respondToSummaryAndDraftCount(summaryData: unknown, draftCount: number) {
  return (query: { target: string }) =>
    (query.target === 'expenses' ? successResponse(null, draftCount) : successResponse(summaryData))
}

describe('getSummary', () => {
  it('reads the expense_summary aggregate and the draft head count for the kindergarten, coercing the aggregate numbers', async () => {
    const { client, queries } = createSupabaseClientFake(respondToSummaryAndDraftCount({
      total_spent: '175.50',
      total_approved: '125.50',
      total_pending: '50.00',
      by_category: { supplies: '150.00', food: '25.50', unknown_category: '99' },
    }, 3))
    const service = createExpensesService(client)

    const result = await service.getSummary(kindergartenId)

    expect(result).toEqual({
      success: true,
      data: {
        totalSpent: 175.5,
        totalApproved: 125.5,
        totalPending: 50,
        byCategory: { supplies: 150, food: 25.5 },
        draftCount: 3,
      },
    })
    const summaryQuery = queries.find(query => query.target === 'rpc:expense_summary')
    expect(argumentsOf(summaryQuery, 'rpc')).toEqual([[{ p_kindergarten_id: kindergartenId }]])

    const draftCountQuery = queries.find(query => query.target === 'expenses')
    expect(argumentsOf(draftCountQuery, 'select')).toEqual([['id', { count: 'exact', head: true }]])
    expect(argumentsOf(draftCountQuery, 'eq')).toEqual([['kindergarten_id', kindergartenId], ['status', 'draft']])
    expect(argumentsOf(draftCountQuery, 'is')).toEqual([['deleted_at', null]])
  })

  it('returns no category totals when the aggregate has none', async () => {
    const { client } = createSupabaseClientFake(respondToSummaryAndDraftCount({
      total_spent: 0, total_approved: 0, total_pending: 0, by_category: null,
    }, 0))
    const service = createExpensesService(client)

    const result = await service.getSummary(kindergartenId)

    expect(result).toEqual({
      success: true,
      data: { totalSpent: 0, totalApproved: 0, totalPending: 0, byCategory: {}, draftCount: 0 },
    })
  })

  it('returns the same failure as an RPC error when the draft count query fails', async () => {
    const { client } = createSupabaseClientFake((query) => {
      if (query.target === 'expenses') return refusalResponse('42501', 403)
      return successResponse({ total_spent: 0, total_approved: 0, total_pending: 0, by_category: null })
    })
    const service = createExpensesService(client)

    const result = await service.getSummary(kindergartenId)

    expect(result).toEqual({ success: false, error: { kind: 'refused', reason: 'forbidden' } })
  })
})

describe('recordExpense', () => {
  it('inserts snake_case columns with the actor as created_by and updated_by', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse(expenseRow))
    const service = createExpensesService(client)

    await service.recordExpense(validInput, actorId)

    const expensesQuery = queries.find(query => query.target === 'expenses')
    expect(argumentsOf(expensesQuery, 'insert')).toEqual([[{
      kindergarten_id: kindergartenId,
      category: 'supplies',
      amount: 120,
      expense_date: '2026-09-01',
      description: null,
      created_by: actorId,
      updated_by: actorId,
    }]])
  })

  it.each([
    ['a negative amount', { amount: -1 }],
    ['a zero amount', { amount: 0 }],
    ['more than 2 decimal places', { amount: 5.005 }],
    ['an unknown category', { category: 'crypto' }],
    ['a malformed date', { expenseDate: '2026/09/01' }],
    ['a non-uuid kindergarten id', { kindergartenId: 'nope' }],
  ])('rejects %s without issuing any query', async (_label, patch) => {
    const { client, queries } = createSupabaseClientFake(() => successResponse(expenseRow))
    const service = createExpensesService(client)

    const result = await service.recordExpense({ ...validInput, ...patch } as unknown as ExpenseInput, actorId)

    expect(result).toEqual({ success: false, error: expect.objectContaining({ kind: 'validation' }) })
    expect(queries).toHaveLength(0)
  })
})

describe('approveExpense', () => {
  const decision = { expenseId: 'expense-1', kindergartenId, actorId }

  it('approves only a live draft of the kindergarten', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse({ ...expenseRow, status: 'approved' }))
    const service = createExpensesService(client)

    await service.approveExpense(decision)

    const expensesQuery = queries.find(query => query.target === 'expenses')
    expect(argumentsOf(expensesQuery, 'update')).toEqual([[{ status: 'approved', approved_by: actorId, updated_by: actorId }]])
    expect(argumentsOf(expensesQuery, 'eq')).toEqual([
      ['id', 'expense-1'],
      ['kindergarten_id', kindergartenId],
      ['status', 'draft'],
    ])
    expect(argumentsOf(expensesQuery, 'is')).toEqual([['deleted_at', null]])
  })

  it('returns refused expense_not_draft when no draft matches', async () => {
    const { client } = createSupabaseClientFake(() => successResponse(null))
    const service = createExpensesService(client)

    const result = await service.approveExpense(decision)

    expect(result).toEqual({ success: false, error: { kind: 'refused', reason: 'expense_not_draft' } })
  })
})

describe('rejectExpense', () => {
  const rejection = { expenseId: 'expense-1', kindergartenId, actorId, reason: '  Duplicate receipt  ' }

  it('stores the trimmed reason on a live draft of the kindergarten', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse({ ...expenseRow, status: 'rejected' }))
    const service = createExpensesService(client)

    await service.rejectExpense(rejection)

    const expensesQuery = queries.find(query => query.target === 'expenses')
    expect(argumentsOf(expensesQuery, 'update')).toEqual([[{ status: 'rejected', rejection_reason: 'Duplicate receipt', updated_by: actorId }]])
    expect(argumentsOf(expensesQuery, 'eq')).toEqual([
      ['id', 'expense-1'],
      ['kindergarten_id', kindergartenId],
      ['status', 'draft'],
    ])
  })

  it('rejects a blank reason without issuing any query', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse(expenseRow))
    const service = createExpensesService(client)

    const result = await service.rejectExpense({ ...rejection, reason: '   ' })

    expect(result).toEqual({ success: false, error: expect.objectContaining({ kind: 'validation' }) })
    expect(queries).toHaveLength(0)
  })

  it('returns refused expense_not_draft when no draft matches', async () => {
    const { client } = createSupabaseClientFake(() => successResponse(null))
    const service = createExpensesService(client)

    const result = await service.rejectExpense(rejection)

    expect(result).toEqual({ success: false, error: { kind: 'refused', reason: 'expense_not_draft' } })
  })
})

describe('postgrest error translation', () => {
  it('maps a status-0 network failure to a network error', async () => {
    const { client } = createSupabaseClientFake(() => networkFailureResponse)
    const service = createExpensesService(client)

    const result = await service.listExpenses(kindergartenId)

    expect(result).toEqual({ success: false, error: { kind: 'network' } })
  })

  it('maps an RLS rejection (42501) to a forbidden refusal', async () => {
    const { client } = createSupabaseClientFake(() => refusalResponse('42501', 403))
    const service = createExpensesService(client)

    const result = await service.listExpenses(kindergartenId)

    expect(result).toEqual({ success: false, error: { kind: 'refused', reason: 'forbidden' } })
  })
})
