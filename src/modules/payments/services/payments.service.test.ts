import { describe, expect, it } from 'vitest'
import {
  argumentsOf,
  createSupabaseClientFake,
  networkFailureResponse,
  refusalResponse,
  successResponse,
} from '@test-support/supabase-client-fake'
import type { PaymentInput } from '@shared/schemas/payment.schema'
import { createPaymentsService } from './payments.service'

const kindergartenId = '3f1a9c2e-5b7d-4e8a-9c1f-2a4b6d8e0f13'
const invoiceId = '7c4e1b9a-2d6f-4a3b-8e5c-1f9d0b7a3c62'
const actorId = 'user-1'

const paymentRow = {
  id: 'payment-1',
  kindergarten_id: kindergartenId,
  invoice_id: invoiceId,
  amount: '250.50',
  paid_date: '2026-09-01',
  method: 'bank_transfer',
  reference_number: 'REF-9',
  status: 'pending',
  notes: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  created_by: actorId,
  updated_by: actorId,
}

const validInput: PaymentInput = {
  kindergartenId,
  invoiceId,
  amount: 250.5,
  paidDate: '2026-09-01',
  method: 'bank_transfer',
}

describe('listPayments', () => {
  it('scopes the query by kindergarten and excludes soft-deleted rows', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse([paymentRow]))
    const service = createPaymentsService(client)

    await service.listPayments(kindergartenId)

    const paymentsQuery = queries.find(query => query.target === 'payments')
    expect(argumentsOf(paymentsQuery, 'eq')).toEqual([['kindergarten_id', kindergartenId]])
    expect(argumentsOf(paymentsQuery, 'is')).toEqual([['deleted_at', null]])
  })

  it('maps snake_case rows and coerces the numeric amount to a number', async () => {
    const { client } = createSupabaseClientFake(() => successResponse([paymentRow]))
    const service = createPaymentsService(client)

    const result = await service.listPayments(kindergartenId)

    expect(result).toEqual({
      success: true,
      data: [{
        id: 'payment-1',
        kindergartenId,
        invoiceId,
        amount: 250.5,
        paidDate: '2026-09-01',
        method: 'bank_transfer',
        referenceNumber: 'REF-9',
        status: 'pending',
        notes: null,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
        createdBy: actorId,
        updatedBy: actorId,
      }],
    })
  })
})

describe('recordPayment validation', () => {
  it('inserts snake_case columns with the actor as created_by and updated_by', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse(paymentRow))
    const service = createPaymentsService(client)

    await service.recordPayment(validInput, actorId)

    const paymentsQuery = queries.find(query => query.target === 'payments')
    expect(argumentsOf(paymentsQuery, 'insert')).toEqual([[{
      kindergarten_id: kindergartenId,
      invoice_id: invoiceId,
      amount: 250.5,
      paid_date: '2026-09-01',
      method: 'bank_transfer',
      reference_number: null,
      notes: null,
      created_by: actorId,
      updated_by: actorId,
    }]])
  })

  it.each([
    ['a negative amount', { amount: -5 }],
    ['a zero amount', { amount: 0 }],
    ['more than 2 decimal places', { amount: 10.123 }],
    ['an unknown payment method', { method: 'crypto' }],
    ['a malformed date', { paidDate: '01-09-2026' }],
    ['a non-uuid invoice id', { invoiceId: 'not-a-uuid' }],
  ])('rejects %s without issuing any query', async (_label, patch) => {
    const { client, queries } = createSupabaseClientFake(() => successResponse(paymentRow))
    const service = createPaymentsService(client)

    const result = await service.recordPayment({ ...validInput, ...patch } as unknown as PaymentInput, actorId)

    expect(result).toEqual({ success: false, error: expect.objectContaining({ kind: 'validation' }) })
    expect(queries).toHaveLength(0)
  })

  it('accepts a numeric string amount', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse(paymentRow))
    const service = createPaymentsService(client)

    const result = await service.recordPayment(
      { ...validInput, amount: '250.50' } as unknown as PaymentInput,
      actorId,
    )

    expect(result.success).toBe(true)
    const paymentsQuery = queries.find(query => query.target === 'payments')
    expect(argumentsOf(paymentsQuery, 'insert')).toEqual([[expect.objectContaining({ amount: 250.5 })]])
  })

  it('returns refused invoice_not_accepting_payments when the database rejects the invoice status', async () => {
    const { client } = createSupabaseClientFake(() => refusalResponse('23514', 400))
    const service = createPaymentsService(client)

    const result = await service.recordPayment(validInput, actorId)

    expect(result).toEqual({ success: false, error: { kind: 'refused', reason: 'invoice_not_accepting_payments' } })
  })
})

describe('getSummary', () => {
  it('reads the payment_summary aggregate scoped to the kindergarten and coerces its numbers', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse({
      confirmed_total: '2012.00',
      pending_count: '3',
      confirmed_count: '1002',
      failed_count: '1',
    }))
    const service = createPaymentsService(client)

    const result = await service.getSummary(kindergartenId)

    expect(result).toEqual({
      success: true,
      data: { confirmedTotal: 2012, pendingCount: 3, confirmedCount: 1002, failedCount: 1 },
    })
    const summaryQuery = queries.find(query => query.target === 'rpc:payment_summary')
    expect(argumentsOf(summaryQuery, 'rpc')).toEqual([[{ p_kindergarten_id: kindergartenId }]])
  })
})

describe('confirmPayment', () => {
  const command = { paymentId: 'payment-1', kindergartenId, actorId }

  it('filters by id, kindergarten, and the pending status', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse({ ...paymentRow, status: 'confirmed' }))
    const service = createPaymentsService(client)

    await service.confirmPayment(command)

    const paymentsQuery = queries.find(query => query.target === 'payments')
    expect(argumentsOf(paymentsQuery, 'eq')).toEqual([
      ['id', command.paymentId],
      ['kindergarten_id', kindergartenId],
      ['status', 'pending'],
    ])
  })

  it('returns refused payment_not_pending when no row matches', async () => {
    const { client } = createSupabaseClientFake(() => successResponse(null))
    const service = createPaymentsService(client)

    const result = await service.confirmPayment(command)

    expect(result).toEqual({ success: false, error: { kind: 'refused', reason: 'payment_not_pending' } })
  })
})

describe('getTotalPaidForInvoice', () => {
  it('reads the confirmed total from the invoice_total_paid aggregate', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse(150.25))
    const service = createPaymentsService(client)

    const result = await service.getTotalPaidForInvoice(invoiceId)

    expect(result).toEqual({ success: true, data: 150.25 })
    const totalQuery = queries.find(query => query.target === 'rpc:invoice_total_paid')
    expect(argumentsOf(totalQuery, 'rpc')).toEqual([[{ p_invoice_id: invoiceId }]])
  })
})

describe('postgrest error translation', () => {
  it('maps a status-0 network failure to a network error', async () => {
    const { client } = createSupabaseClientFake(() => networkFailureResponse)
    const service = createPaymentsService(client)

    const result = await service.listPayments(kindergartenId)

    expect(result).toEqual({ success: false, error: { kind: 'network' } })
  })

  it('maps an RLS rejection (42501) to a forbidden refusal', async () => {
    const { client } = createSupabaseClientFake(() => refusalResponse('42501', 403))
    const service = createPaymentsService(client)

    const result = await service.listPayments(kindergartenId)

    expect(result).toEqual({ success: false, error: { kind: 'refused', reason: 'forbidden' } })
  })
})
