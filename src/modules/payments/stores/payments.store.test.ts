import { describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import type { AppError } from '@core/errors/app-error'
import type { PaymentInput } from '@shared/schemas/payment.schema'
import type { Result } from '@shared/types/result'
import { paymentsDependenciesKey } from '../payments.dependencies'
import type {
  ListPayableInvoices,
  PayableInvoice,
  Payment,
  PaymentsDependencies,
  PaymentsService,
  PaymentSummary,
} from '../types/payments.types'
import { usePaymentsStore } from './payments.store'

const kindergartenA = 'kg-a'
const kindergartenB = 'kg-b'

const paymentA: Payment = {
  id: 'payment-a',
  kindergartenId: kindergartenA,
  invoiceId: 'invoice-a',
  amount: 250.5,
  paidDate: '2026-09-01',
  method: 'bank_transfer',
  referenceNumber: 'REF-9',
  status: 'pending',
  notes: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  createdBy: 'user-1',
  updatedBy: 'user-1',
}

const paymentB: Payment = { ...paymentA, id: 'payment-b', kindergartenId: kindergartenB }

const summaryA: PaymentSummary = { confirmedTotal: 0, pendingCount: 1, confirmedCount: 0, failedCount: 0 }
const refreshedSummary: PaymentSummary = { confirmedTotal: 250.5, pendingCount: 0, confirmedCount: 1, failedCount: 0 }

const payableInvoiceA: PayableInvoice = { id: 'invoice-a', childName: 'Maria Ionescu', amount: 250.5, dueDate: '2026-09-01' }

const validPaymentInput: PaymentInput = {
  kindergartenId: kindergartenA,
  invoiceId: 'invoice-a',
  amount: 250.5,
  paidDate: '2026-09-01',
  method: 'bank_transfer',
}

interface PaymentsServiceOverrides {
  listPayments?: PaymentsService['listPayments']
  getSummary?: PaymentsService['getSummary']
  recordPayment?: PaymentsService['recordPayment']
  confirmPayment?: PaymentsService['confirmPayment']
  getTotalPaidForInvoice?: PaymentsService['getTotalPaidForInvoice']
  listPayableInvoices?: ListPayableInvoices
  readCurrentActorId?: () => string | null
}

function createFakePaymentsDependencies(overrides: PaymentsServiceOverrides = {}): PaymentsDependencies {
  return {
    paymentsService: {
      listPayments: overrides.listPayments
        ?? vi.fn<PaymentsService['listPayments']>().mockResolvedValue({ success: true, data: [] }),
      getSummary: overrides.getSummary
        ?? vi.fn<PaymentsService['getSummary']>().mockResolvedValue({ success: true, data: summaryA }),
      recordPayment: overrides.recordPayment
        ?? vi.fn<PaymentsService['recordPayment']>().mockResolvedValue({ success: true, data: paymentA }),
      confirmPayment: overrides.confirmPayment
        ?? vi.fn<PaymentsService['confirmPayment']>().mockResolvedValue({ success: true, data: paymentA }),
      getTotalPaidForInvoice: overrides.getTotalPaidForInvoice
        ?? vi.fn<PaymentsService['getTotalPaidForInvoice']>().mockResolvedValue({ success: true, data: 0 }),
    },
    listPayableInvoices: overrides.listPayableInvoices
      ?? vi.fn<ListPayableInvoices>().mockResolvedValue({ success: true, data: [payableInvoiceA] }),
    readCurrentActorId: overrides.readCurrentActorId ?? vi.fn(() => 'actor-1'),
  }
}

function createPaymentsStore(dependencies: PaymentsDependencies) {
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  app.provide(paymentsDependenciesKey, dependencies)
  return usePaymentsStore(pinia)
}

describe('status', () => {
  it('starts loading before any payments are requested', () => {
    const store = createPaymentsStore(createFakePaymentsDependencies())
    expect(store.status).toBe('loading')
  })

  it('is ready once a kindergarten with payments has loaded', async () => {
    const store = createPaymentsStore(createFakePaymentsDependencies({
      listPayments: vi.fn<PaymentsService['listPayments']>().mockResolvedValue({ success: true, data: [paymentA] }),
    }))

    await store.loadPayments(kindergartenA)

    expect(store.status).toBe('ready')
  })

  it('is empty once a kindergarten with no payments has loaded', async () => {
    const store = createPaymentsStore(createFakePaymentsDependencies())

    await store.loadPayments(kindergartenA)

    expect(store.status).toBe('empty')
  })

  it('is failed with loadError set when the payments request fails', async () => {
    const listFailure: AppError = { kind: 'network' }
    const store = createPaymentsStore(createFakePaymentsDependencies({
      listPayments: vi.fn<PaymentsService['listPayments']>().mockResolvedValue({ success: false, error: listFailure }),
    }))

    await store.loadPayments(kindergartenA)

    expect(store.status).toBe('failed')
    expect(store.loadError).toEqual(listFailure)
  })

  it('is failed with loadError set when the summary request fails', async () => {
    const summaryFailure: AppError = { kind: 'refused', reason: 'forbidden' }
    const store = createPaymentsStore(createFakePaymentsDependencies({
      listPayments: vi.fn<PaymentsService['listPayments']>().mockResolvedValue({ success: true, data: [paymentA] }),
      getSummary: vi.fn<PaymentsService['getSummary']>().mockResolvedValue({ success: false, error: summaryFailure }),
    }))

    await store.loadPayments(kindergartenA)

    expect(store.status).toBe('failed')
    expect(store.loadError).toEqual(summaryFailure)
  })
})

describe('loadPayments', () => {
  it('loads the database-side summary with the payments', async () => {
    const store = createPaymentsStore(createFakePaymentsDependencies())

    await store.loadPayments(kindergartenA)

    expect(store.summary).toEqual(summaryA)
    expect(store.isSummaryOutdated).toBe(false)
  })

  it('still loads payments when the payable invoices request fails', async () => {
    const payableFailure: AppError = { kind: 'refused', reason: 'forbidden' }
    const store = createPaymentsStore(createFakePaymentsDependencies({
      listPayments: vi.fn<PaymentsService['listPayments']>().mockResolvedValue({ success: true, data: [paymentA] }),
      listPayableInvoices: vi.fn<ListPayableInvoices>().mockResolvedValue({ success: false, error: payableFailure }),
    }))

    await store.loadPayments(kindergartenA)

    expect(store.status).toBe('ready')
    expect(store.payableInvoicesError).toEqual(payableFailure)
    expect(store.payableInvoices).toEqual([])
  })

  it('drops previously loaded payable invoices when reloading them fails', async () => {
    const payableFailure: AppError = { kind: 'network' }
    const listPayableInvoices = vi.fn<ListPayableInvoices>()
      .mockResolvedValueOnce({ success: true, data: [payableInvoiceA] })
      .mockResolvedValueOnce({ success: false, error: payableFailure })
    const store = createPaymentsStore(createFakePaymentsDependencies({ listPayableInvoices }))
    await store.loadPayments(kindergartenA)
    expect(store.payableInvoices).toEqual([payableInvoiceA])

    await store.loadPayments(kindergartenA)

    expect(store.payableInvoices).toEqual([])
    expect(store.payableInvoicesError).toEqual(payableFailure)
  })

  it('ignores a slow kindergarten-A response that resolves after kindergarten B has loaded', async () => {
    let resolvePaymentsA: (result: Result<Payment[], AppError>) => void = () => {}
    const pendingPaymentsA = new Promise<Result<Payment[], AppError>>((resolve) => { resolvePaymentsA = resolve })
    const listPayments = vi.fn<PaymentsService['listPayments']>(async kindergartenId =>
      (kindergartenId === kindergartenA ? pendingPaymentsA : { success: true, data: [paymentB] }))
    const store = createPaymentsStore(createFakePaymentsDependencies({ listPayments }))

    const loadingA = store.loadPayments(kindergartenA)
    await store.loadPayments(kindergartenB)
    resolvePaymentsA({ success: true, data: [paymentA] })
    await expect(loadingA).resolves.toBe(false)

    expect(store.loadedKindergartenId).toBe(kindergartenB)
    expect(store.payments).toEqual([paymentB])
  })
})

describe('loadPayableInvoices', () => {
  it('clears the error and fills the list when a retry succeeds', async () => {
    const listPayableInvoices = vi.fn<ListPayableInvoices>()
      .mockResolvedValueOnce({ success: false, error: { kind: 'network' } })
      .mockResolvedValueOnce({ success: true, data: [payableInvoiceA] })
    const store = createPaymentsStore(createFakePaymentsDependencies({ listPayableInvoices }))
    await store.loadPayments(kindergartenA)

    await expect(store.loadPayableInvoices(kindergartenA)).resolves.toBe(true)

    expect(store.payableInvoicesError).toBeNull()
    expect(store.payableInvoices).toEqual([payableInvoiceA])
  })

  it('ignores a retry for a kindergarten that is no longer loaded', async () => {
    const payableInvoiceB: PayableInvoice = { ...payableInvoiceA, id: 'invoice-b' }
    let resolveRetryA: (result: Result<PayableInvoice[], AppError>) => void = () => {}
    const pendingRetryA = new Promise<Result<PayableInvoice[], AppError>>((resolve) => { resolveRetryA = resolve })
    const listPayableInvoices = vi.fn<ListPayableInvoices>()
      .mockResolvedValueOnce({ success: true, data: [payableInvoiceA] })
      .mockReturnValueOnce(pendingRetryA)
      .mockResolvedValueOnce({ success: true, data: [payableInvoiceB] })
    const store = createPaymentsStore(createFakePaymentsDependencies({ listPayableInvoices }))
    await store.loadPayments(kindergartenA)

    const retryingA = store.loadPayableInvoices(kindergartenA)
    await store.loadPayments(kindergartenB)
    resolveRetryA({ success: true, data: [payableInvoiceA] })

    await expect(retryingA).resolves.toBe(false)
    expect(store.payableInvoices).toEqual([payableInvoiceB])
  })
})

describe('recordPayment', () => {
  it('returns refused session_expired without calling the service when there is no signed-in actor', async () => {
    const recordPayment = vi.fn()
    const store = createPaymentsStore(createFakePaymentsDependencies({
      readCurrentActorId: () => null,
      recordPayment,
    }))

    const result = await store.recordPayment(validPaymentInput)

    expect(result).toEqual({ success: false, error: { kind: 'refused', reason: 'session_expired' } })
    expect(recordPayment).not.toHaveBeenCalled()
  })

  it('prepends a newly recorded payment and refreshes the summary', async () => {
    const newPayment: Payment = { ...paymentA, id: 'payment-new' }
    const getSummary = vi.fn<PaymentsService['getSummary']>().mockResolvedValue({ success: true, data: summaryA })
    const store = createPaymentsStore(createFakePaymentsDependencies({
      listPayments: vi.fn<PaymentsService['listPayments']>().mockResolvedValue({ success: true, data: [paymentA] }),
      getSummary,
      recordPayment: vi.fn<PaymentsService['recordPayment']>().mockResolvedValue({ success: true, data: newPayment }),
    }))
    await store.loadPayments(kindergartenA)
    getSummary.mockResolvedValueOnce({ success: true, data: refreshedSummary })

    const result = await store.recordPayment(validPaymentInput)

    expect(result).toEqual({ success: true, data: newPayment })
    expect(store.payments).toEqual([newPayment, paymentA])
    expect(store.summary).toEqual(refreshedSummary)
  })
})

describe('confirmPayment', () => {
  it('confirms a payment using the loaded kindergarten and current actor, replacing it in the list', async () => {
    const confirmedPayment: Payment = { ...paymentA, status: 'confirmed' }
    const confirmPayment = vi.fn<PaymentsService['confirmPayment']>().mockResolvedValue({ success: true, data: confirmedPayment })
    const store = createPaymentsStore(createFakePaymentsDependencies({
      listPayments: vi.fn<PaymentsService['listPayments']>().mockResolvedValue({ success: true, data: [paymentA] }),
      confirmPayment,
      readCurrentActorId: () => 'actor-9',
    }))
    await store.loadPayments(kindergartenA)

    const result = await store.confirmPayment(paymentA.id)

    expect(result).toEqual({ success: true, data: confirmedPayment })
    expect(confirmPayment).toHaveBeenCalledWith({
      paymentId: paymentA.id,
      kindergartenId: kindergartenA,
      actorId: 'actor-9',
    })
    expect(store.payments).toEqual([confirmedPayment])
  })

  it('still reports success and flags the totals as outdated when the summary refresh fails', async () => {
    const confirmedPayment: Payment = { ...paymentA, status: 'confirmed' }
    const getSummary = vi.fn<PaymentsService['getSummary']>().mockResolvedValue({ success: true, data: summaryA })
    const store = createPaymentsStore(createFakePaymentsDependencies({
      listPayments: vi.fn<PaymentsService['listPayments']>().mockResolvedValue({ success: true, data: [paymentA] }),
      getSummary,
      confirmPayment: vi.fn<PaymentsService['confirmPayment']>().mockResolvedValue({ success: true, data: confirmedPayment }),
    }))
    await store.loadPayments(kindergartenA)
    getSummary.mockResolvedValueOnce({ success: false, error: { kind: 'network' } })

    const result = await store.confirmPayment(paymentA.id)

    expect(result).toEqual({ success: true, data: confirmedPayment })
    expect(store.isSummaryOutdated).toBe(true)
    expect(store.summary).toEqual(summaryA)

    await store.loadPayments(kindergartenA)

    expect(store.isSummaryOutdated).toBe(false)
  })

  it('keeps the newest summary when an older refresh resolves last', async () => {
    const paymentC: Payment = { ...paymentA, id: 'payment-c' }
    const olderSummary: PaymentSummary = { ...summaryA, confirmedCount: 1 }
    let resolveOlderSummary: (result: Result<PaymentSummary, AppError>) => void = () => {}
    const pendingOlderSummary = new Promise<Result<PaymentSummary, AppError>>((resolve) => { resolveOlderSummary = resolve })
    const getSummary = vi.fn<PaymentsService['getSummary']>()
      .mockResolvedValueOnce({ success: true, data: summaryA })
      .mockReturnValueOnce(pendingOlderSummary)
      .mockResolvedValueOnce({ success: true, data: refreshedSummary })
    const store = createPaymentsStore(createFakePaymentsDependencies({
      listPayments: vi.fn<PaymentsService['listPayments']>().mockResolvedValue({ success: true, data: [paymentA, paymentC] }),
      getSummary,
      confirmPayment: vi.fn<PaymentsService['confirmPayment']>(async ({ paymentId }) =>
        ({ success: true, data: { ...paymentA, id: paymentId, status: 'confirmed' } })),
    }))
    await store.loadPayments(kindergartenA)

    const confirmingA = store.confirmPayment(paymentA.id)
    await store.confirmPayment(paymentC.id)
    resolveOlderSummary({ success: true, data: olderSummary })
    await confirmingA

    expect(store.summary).toEqual(refreshedSummary)
  })
})
