import { describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import type { AppError } from '@core/errors/app-error'
import type { Result } from '@shared/types/result'
import { billingDependenciesKey } from '../billing.dependencies'
import type { BillingDependencies, BillingService, Invoice, InvoiceSummary } from '../types/billing.types'
import { useBillingStore } from './billing.store'

const kindergartenA = 'kg-a'
const kindergartenB = 'kg-b'

const invoiceA: Invoice = {
  id: 'invoice-a',
  kindergartenId: kindergartenA,
  childId: 'child-a',
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
}

const invoiceB: Invoice = { ...invoiceA, id: 'invoice-b', kindergartenId: kindergartenB, childName: 'Ion Pop' }

const summaryA: InvoiceSummary = { totalIssued: 250.5, totalPaid: 0, totalOverdue: 0, pendingCount: 1 }
const refreshedSummary: InvoiceSummary = { totalIssued: 250.5, totalPaid: 250.5, totalOverdue: 0, pendingCount: 0 }

interface BillingServiceOverrides {
  listInvoices?: BillingService['listInvoices']
  getSummary?: BillingService['getSummary']
  listPayableInvoices?: BillingService['listPayableInvoices']
  markInvoicePaid?: BillingService['markInvoicePaid']
  readCurrentActorId?: () => string | null
}

function createFakeBillingDependencies(overrides: BillingServiceOverrides = {}): BillingDependencies {
  return {
    billingService: {
      listInvoices: overrides.listInvoices
        ?? vi.fn<BillingService['listInvoices']>().mockResolvedValue({ success: true, data: [] }),
      getSummary: overrides.getSummary
        ?? vi.fn<BillingService['getSummary']>().mockResolvedValue({ success: true, data: summaryA }),
      listPayableInvoices: overrides.listPayableInvoices
        ?? vi.fn<BillingService['listPayableInvoices']>().mockResolvedValue({ success: true, data: [] }),
      markInvoicePaid: overrides.markInvoicePaid
        ?? vi.fn<BillingService['markInvoicePaid']>().mockResolvedValue({ success: true, data: invoiceA }),
    },
    readCurrentActorId: overrides.readCurrentActorId ?? vi.fn(() => 'actor-1'),
  }
}

function createBillingStore(dependencies: BillingDependencies) {
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  app.provide(billingDependenciesKey, dependencies)
  return useBillingStore(pinia)
}

describe('status', () => {
  it('starts loading before any invoices are requested', () => {
    const store = createBillingStore(createFakeBillingDependencies())
    expect(store.status).toBe('loading')
  })

  it('is ready once a kindergarten with invoices has loaded', async () => {
    const store = createBillingStore(createFakeBillingDependencies({
      listInvoices: vi.fn<BillingService['listInvoices']>().mockResolvedValue({ success: true, data: [invoiceA] }),
    }))

    await store.loadInvoices(kindergartenA)

    expect(store.status).toBe('ready')
  })

  it('is empty once a kindergarten with no invoices has loaded', async () => {
    const store = createBillingStore(createFakeBillingDependencies())

    await store.loadInvoices(kindergartenA)

    expect(store.status).toBe('empty')
  })

  it('is failed with loadError set when the invoice list request fails', async () => {
    const listFailure: AppError = { kind: 'network' }
    const store = createBillingStore(createFakeBillingDependencies({
      listInvoices: vi.fn<BillingService['listInvoices']>().mockResolvedValue({ success: false, error: listFailure }),
    }))

    await store.loadInvoices(kindergartenA)

    expect(store.status).toBe('failed')
    expect(store.loadError).toEqual(listFailure)
  })
})

describe('loadInvoices', () => {
  it('ignores a slow kindergarten-A response that resolves after kindergarten B has loaded', async () => {
    let resolveInvoicesA: (result: Result<Invoice[], AppError>) => void = () => {}
    const pendingInvoicesA = new Promise<Result<Invoice[], AppError>>((resolve) => { resolveInvoicesA = resolve })
    const listInvoices = vi.fn<BillingService['listInvoices']>(async kindergartenId =>
      (kindergartenId === kindergartenA ? pendingInvoicesA : { success: true, data: [invoiceB] }))
    const store = createBillingStore(createFakeBillingDependencies({ listInvoices }))

    const loadingA = store.loadInvoices(kindergartenA)
    await store.loadInvoices(kindergartenB)
    resolveInvoicesA({ success: true, data: [invoiceA] })
    await expect(loadingA).resolves.toBe(false)

    expect(store.loadedKindergartenId).toBe(kindergartenB)
    expect(store.invoices).toEqual([invoiceB])
  })

  it('clears the previous tenant\'s invoices as soon as a different kindergarten starts loading', async () => {
    let resolveInvoicesB: (result: Result<Invoice[], AppError>) => void = () => {}
    const pendingInvoicesB = new Promise<Result<Invoice[], AppError>>((resolve) => { resolveInvoicesB = resolve })
    const listInvoices = vi.fn<BillingService['listInvoices']>(async kindergartenId =>
      (kindergartenId === kindergartenA ? { success: true, data: [invoiceA] } : pendingInvoicesB))
    const store = createBillingStore(createFakeBillingDependencies({ listInvoices }))
    await store.loadInvoices(kindergartenA)
    expect(store.invoices).toEqual([invoiceA])

    const loadingB = store.loadInvoices(kindergartenB)
    expect(store.invoices).toEqual([])

    resolveInvoicesB({ success: true, data: [invoiceB] })
    await loadingB
  })
})

describe('markInvoicePaid', () => {
  it('returns refused session_expired without calling the service when there is no signed-in actor', async () => {
    const markInvoicePaid = vi.fn()
    const store = createBillingStore(createFakeBillingDependencies({
      readCurrentActorId: () => null,
      markInvoicePaid,
    }))

    const result = await store.markInvoicePaid(invoiceA.id)

    expect(result).toEqual({ success: false, error: { kind: 'refused', reason: 'session_expired' } })
    expect(markInvoicePaid).not.toHaveBeenCalled()
  })

  it('replaces the settled invoice and refreshes the summary on success', async () => {
    const paidInvoice: Invoice = { ...invoiceA, status: 'paid', paidAt: '2026-09-10T00:00:00Z' }
    const getSummary = vi.fn<BillingService['getSummary']>().mockResolvedValue({ success: true, data: summaryA })
    const markInvoicePaid = vi.fn<BillingService['markInvoicePaid']>().mockResolvedValue({ success: true, data: paidInvoice })
    const store = createBillingStore(createFakeBillingDependencies({
      listInvoices: vi.fn<BillingService['listInvoices']>().mockResolvedValue({ success: true, data: [invoiceA] }),
      getSummary,
      markInvoicePaid,
    }))
    await store.loadInvoices(kindergartenA)
    getSummary.mockResolvedValueOnce({ success: true, data: refreshedSummary })

    const result = await store.markInvoicePaid(invoiceA.id)

    expect(result).toEqual({ success: true, data: paidInvoice })
    expect(markInvoicePaid).toHaveBeenCalledWith({
      invoiceId: invoiceA.id,
      kindergartenId: kindergartenA,
      actorId: 'actor-1',
    })
    expect(store.invoices).toEqual([paidInvoice])
    expect(store.summary).toEqual(refreshedSummary)
  })

  it('is settling while the request is in flight and not settling after it completes', async () => {
    let resolveMark: (result: Result<Invoice, AppError>) => void = () => {}
    const pendingMark = new Promise<Result<Invoice, AppError>>((resolve) => { resolveMark = resolve })
    const store = createBillingStore(createFakeBillingDependencies({
      listInvoices: vi.fn<BillingService['listInvoices']>().mockResolvedValue({ success: true, data: [invoiceA] }),
      markInvoicePaid: vi.fn<BillingService['markInvoicePaid']>(() => pendingMark),
    }))
    await store.loadInvoices(kindergartenA)

    const settling = store.markInvoicePaid(invoiceA.id)
    expect(store.isSettling(invoiceA.id)).toBe(true)

    resolveMark({ success: true, data: { ...invoiceA, status: 'paid' } })
    await settling

    expect(store.isSettling(invoiceA.id)).toBe(false)
  })

  it('still reports success when the summary refresh fails after settling', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const paidInvoice: Invoice = { ...invoiceA, status: 'paid' }
    const getSummary = vi.fn<BillingService['getSummary']>().mockResolvedValue({ success: true, data: summaryA })
    const store = createBillingStore(createFakeBillingDependencies({
      listInvoices: vi.fn<BillingService['listInvoices']>().mockResolvedValue({ success: true, data: [invoiceA] }),
      getSummary,
      markInvoicePaid: vi.fn<BillingService['markInvoicePaid']>().mockResolvedValue({ success: true, data: paidInvoice }),
    }))
    await store.loadInvoices(kindergartenA)
    getSummary.mockResolvedValueOnce({ success: false, error: { kind: 'network' } })

    const result = await store.markInvoicePaid(invoiceA.id)

    expect(result).toEqual({ success: true, data: paidInvoice })
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
  })
})
