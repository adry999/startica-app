import { describe, expect, it } from 'vitest'
import {
  argumentsOf,
  createSupabaseClientFake,
  networkFailureResponse,
  refusalResponse,
  successResponse,
} from '@test-support/supabase-client-fake'
import { createBillingService } from './billing.service'

const kindergartenId = '11111111-1111-4111-8111-111111111111'

const invoiceRow = {
  id: 'invoice-1',
  kindergarten_id: kindergartenId,
  child_id: 'child-1',
  amount: '250.50',
  due_date: '2026-09-01',
  paid_at: null,
  status: 'issued',
  notes: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  created_by: 'user-1',
  updated_by: 'user-1',
  children: { first_name: 'Maria', last_name: 'Ionescu' },
}

describe('listInvoices', () => {
  it('scopes the query by kindergarten and excludes soft-deleted rows', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse([invoiceRow]))
    const service = createBillingService(client)

    await service.listInvoices(kindergartenId)

    const invoicesQuery = queries.find(query => query.target === 'invoices')
    expect(argumentsOf(invoicesQuery, 'eq')).toEqual([['kindergarten_id', kindergartenId]])
    expect(argumentsOf(invoicesQuery, 'is')).toEqual([['deleted_at', null]])
  })

  it('maps snake_case rows, the embedded child name, and coerces the numeric amount', async () => {
    const { client } = createSupabaseClientFake(() => successResponse([invoiceRow]))
    const service = createBillingService(client)

    const result = await service.listInvoices(kindergartenId)

    expect(result).toEqual({
      success: true,
      data: [{
        id: 'invoice-1',
        kindergartenId,
        childId: 'child-1',
        childName: 'Maria Ionescu',
        amount: 250.5,
        dueDate: '2026-09-01',
        paidAt: null,
        status: 'issued',
        notes: null,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
        createdBy: 'user-1',
        updatedBy: 'user-1',
      }],
    })
  })
})

describe('getSummary', () => {
  it('reads the invoice_summary aggregate scoped to the kindergarten and coerces its numbers', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse({
      total_issued: '500.00',
      total_paid: '250.50',
      total_overdue: '10.25',
      pending_count: '3',
    }))
    const service = createBillingService(client)

    const result = await service.getSummary(kindergartenId)

    expect(result).toEqual({
      success: true,
      data: { totalIssued: 500, totalPaid: 250.5, totalOverdue: 10.25, pendingCount: 3 },
    })
    const summaryQuery = queries.find(query => query.target === 'rpc:invoice_summary')
    expect(argumentsOf(summaryQuery, 'rpc')).toEqual([[{ p_kindergarten_id: kindergartenId }]])
  })
})

describe('listPayableInvoices', () => {
  it('filters to issued, overdue and paid invoices scoped to the kindergarten', async () => {
    const payableRow = {
      id: 'invoice-2',
      amount: '100.00',
      due_date: '2026-09-05',
      children: { first_name: 'Ion', last_name: 'Pop' },
    }
    const { client, queries } = createSupabaseClientFake(() => successResponse([payableRow]))
    const service = createBillingService(client)

    const result = await service.listPayableInvoices(kindergartenId)

    expect(result).toEqual({
      success: true,
      data: [{ id: 'invoice-2', childName: 'Ion Pop', amount: 100, dueDate: '2026-09-05' }],
    })
    const invoicesQuery = queries.find(query => query.target === 'invoices')
    expect(argumentsOf(invoicesQuery, 'eq')).toEqual([['kindergarten_id', kindergartenId]])
    expect(argumentsOf(invoicesQuery, 'in')).toEqual([['status', ['issued', 'overdue', 'paid']]])
  })
})

describe('markInvoicePaid', () => {
  const command = { invoiceId: 'invoice-1', kindergartenId, actorId: 'user-1' }

  it('filters by id, kindergarten, and the payable statuses', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse(invoiceRow))
    const service = createBillingService(client)

    await service.markInvoicePaid(command)

    const invoicesQuery = queries.find(query => query.target === 'invoices')
    expect(argumentsOf(invoicesQuery, 'eq')).toEqual([
      ['id', command.invoiceId],
      ['kindergarten_id', kindergartenId],
    ])
    expect(argumentsOf(invoicesQuery, 'in')).toEqual([['status', ['issued', 'overdue']]])
  })

  it('returns refused invoice_not_payable when no row matches', async () => {
    const { client } = createSupabaseClientFake(() => successResponse(null))
    const service = createBillingService(client)

    const result = await service.markInvoicePaid(command)

    expect(result).toEqual({ success: false, error: { kind: 'refused', reason: 'invoice_not_payable' } })
  })
})

describe('postgrest error translation', () => {
  it('maps a status-0 network failure to a network error', async () => {
    const { client } = createSupabaseClientFake(() => networkFailureResponse)
    const service = createBillingService(client)

    const result = await service.listInvoices(kindergartenId)

    expect(result).toEqual({ success: false, error: { kind: 'network' } })
  })

  it('maps an RLS rejection (42501) to a forbidden refusal', async () => {
    const { client } = createSupabaseClientFake(() => refusalResponse('42501', 403))
    const service = createBillingService(client)

    const result = await service.listInvoices(kindergartenId)

    expect(result).toEqual({ success: false, error: { kind: 'refused', reason: 'forbidden' } })
  })
})
