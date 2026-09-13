import { describe, it, expect, vi } from 'vitest'
import { listPayments, createPayment, confirmPayment, getTotalPaidForInvoice } from './payments.service'

const sampleRow = {
  id: 'pay-1',
  kindergarten_id: '3f1a9c2e-5b7d-4e8a-9c1f-2a4b6d8e0f13',
  invoice_id: '7c4e1b9a-2d6f-4a3b-8e5c-1f9d0b7a3c62',
  amount: '250.50',
  paid_date: '2026-09-01',
  method: 'bank_transfer',
  reference_number: 'REF-9',
  status: 'pending',
  notes: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  created_by: 'user-1',
  updated_by: 'user-1',
  deleted_at: null,
}

const validInput = {
  kindergartenId: '3f1a9c2e-5b7d-4e8a-9c1f-2a4b6d8e0f13',
  invoiceId: '7c4e1b9a-2d6f-4a3b-8e5c-1f9d0b7a3c62',
  amount: 250.5,
  paidDate: '2026-09-01',
  method: 'bank_transfer' as const,
}

function createMockClient(overrides: Record<string, unknown> = {}) {
  const insertSingle = vi.fn().mockResolvedValue({ data: sampleRow, error: null })
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({ single: insertSingle }),
  })
  const client = {
    from: vi.fn().mockReturnValue({
      insert,
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [sampleRow], error: null }),
          }),
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({
              data: [{ amount: '100.00' }, { amount: '50.25' }],
              error: null,
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ...sampleRow, status: 'confirmed' },
              error: null,
            }),
          }),
        }),
      }),
      ...overrides,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
  return { client, insert }
}

describe('listPayments', () => {
  it('maps rows and coerces the numeric amount to a number', async () => {
    const { client } = createMockClient()
    const result = await listPayments(client, validInput.kindergartenId)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toHaveLength(1)
    expect(result.data[0]!.amount).toBe(250.5)
    expect(result.data[0]!.invoiceId).toBe(validInput.invoiceId)
  })
})

describe('createPayment validation', () => {
  it('inserts snake_case columns when the input is valid', async () => {
    const { client, insert } = createMockClient()
    const result = await createPayment(client, validInput, 'user-1')

    expect(result.success).toBe(true)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kindergarten_id: validInput.kindergartenId,
        invoice_id: validInput.invoiceId,
        amount: 250.5,
        paid_date: '2026-09-01',
        method: 'bank_transfer',
        created_by: 'user-1',
        updated_by: 'user-1',
      }),
    )
  })

  it.each([
    ['a negative amount', { amount: -5 }],
    ['a zero amount', { amount: 0 }],
    ['more than 2 decimal places', { amount: 10.123 }],
    ['an unknown payment method', { method: 'crypto' }],
    ['a malformed date', { paidDate: '01-09-2026' }],
    ['a non-uuid invoice id', { invoiceId: 'not-a-uuid' }],
  ])('rejects %s without touching the database', async (_label, patch) => {
    const { client, insert } = createMockClient()
    const result = await createPayment(client, { ...validInput, ...patch } as never, 'user-1')

    expect(result.success).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })

  it('accepts a numeric string amount from a number input', async () => {
    const { client, insert } = createMockClient()
    const result = await createPayment(client, { ...validInput, amount: '250.50' } as never, 'user-1')

    expect(result.success).toBe(true)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ amount: 250.5 }))
  })
})

describe('confirmPayment', () => {
  it('returns the row with confirmed status', async () => {
    const { client } = createMockClient()
    const result = await confirmPayment(client, 'pay-1', 'user-1')

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('confirmed')
  })
})

describe('getTotalPaidForInvoice', () => {
  it('reads the confirmed total from the database aggregate', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 150.25, error: null })
    const result = await getTotalPaidForInvoice({ rpc } as never, validInput.invoiceId)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toBe(150.25)
    expect(rpc).toHaveBeenCalledWith('invoice_total_paid', { p_invoice_id: validInput.invoiceId })
  })
})
