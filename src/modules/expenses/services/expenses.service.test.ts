import { describe, it, expect, vi } from 'vitest'
import { createExpense, getSummary } from './expenses.service'

const KG_ID = '3f1a9c2e-5b7d-4e8a-9c1f-2a4b6d8e0f13'

const sampleRow = {
  id: 'exp-1',
  kindergarten_id: KG_ID,
  category: 'supplies',
  amount: '120.00',
  expense_date: '2026-09-01',
  description: null,
  status: 'draft',
  approved_by: null,
  rejection_reason: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  created_by: 'user-1',
  updated_by: 'user-1',
  deleted_at: null,
}

const validInput = {
  kindergartenId: KG_ID,
  category: 'supplies' as const,
  amount: 120,
  expenseDate: '2026-09-01',
}

function createMockClient(summary: Record<string, unknown> | null = null) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: sampleRow, error: null }),
    }),
  })
  const client = {
    from: vi.fn().mockReturnValue({
      insert,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
    // getSummary aggregates in Postgres via rpc(), not by summing rows client-side
    rpc: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: summary, error: null }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
  return { client, insert }
}

describe('createExpense validation', () => {
  it('inserts snake_case columns when the input is valid', async () => {
    const { client, insert } = createMockClient()
    const result = await createExpense(client, validInput, 'user-1')

    expect(result.success).toBe(true)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kindergarten_id: KG_ID,
        category: 'supplies',
        amount: 120,
        expense_date: '2026-09-01',
        created_by: 'user-1',
        updated_by: 'user-1',
      }),
    )
  })

  it.each([
    ['a negative amount', { amount: -1 }],
    ['a zero amount', { amount: 0 }],
    ['more than 2 decimal places', { amount: 5.005 }],
    ['an unknown category', { category: 'crypto' }],
    ['a malformed date', { expenseDate: '2026/09/01' }],
    ['a non-uuid kindergarten id', { kindergartenId: 'nope' }],
  ])('rejects %s without touching the database', async (_label, patch) => {
    const { client, insert } = createMockClient()
    const result = await createExpense(client, { ...validInput, ...patch } as never, 'user-1')

    expect(result.success).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('getSummary', () => {
  it('maps the aggregate returned by the expense_summary function', async () => {
    const { client } = createMockClient({
      total_spent: '175.50',
      total_approved: '125.50',
      total_pending: '50.00',
      by_category: { supplies: '150.00', food: '35.50' },
    })

    const result = await getSummary(client, KG_ID)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.totalSpent).toBe(175.5)
    expect(result.data.totalApproved).toBe(125.5)
    expect(result.data.totalPending).toBe(50)
    expect(result.data.byCategory.supplies).toBe(150)
    expect(result.data.byCategory.food).toBe(35.5)
  })

  it('calls the function with the kindergarten id', async () => {
    const { client } = createMockClient({ total_spent: 0, total_approved: 0, total_pending: 0, by_category: {} })
    await getSummary(client, KG_ID)
    expect(client.rpc).toHaveBeenCalledWith('expense_summary', { p_kindergarten_id: KG_ID })
  })

  it('returns zeroed totals when there are no expenses', async () => {
    const { client } = createMockClient({ total_spent: 0, total_approved: 0, total_pending: 0, by_category: null })
    const result = await getSummary(client, KG_ID)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.totalApproved).toBe(0)
    expect(result.data.totalPending).toBe(0)
    expect(result.data.byCategory).toEqual({})
  })
})
