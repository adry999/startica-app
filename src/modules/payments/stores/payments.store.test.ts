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
})

describe('loadPayments', () => {
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

  it('prepends a newly recorded payment to the list', async () => {
    const newPayment: Payment = { ...paymentA, id: 'payment-new' }
    const store = createPaymentsStore(createFakePaymentsDependencies({
      listPayments: vi.fn<PaymentsService['listPayments']>().mockResolvedValue({ success: true, data: [paymentA] }),
      recordPayment: vi.fn<PaymentsService['recordPayment']>().mockResolvedValue({ success: true, data: newPayment }),
    }))
    await store.loadPayments(kindergartenA)

    const result = await store.recordPayment(validPaymentInput)

    expect(result).toEqual({ success: true, data: newPayment })
    expect(store.payments).toEqual([newPayment, paymentA])
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
})

describe('confirmedTotal', () => {
  it('sums confirmed payments in cents, ignoring pending ones, so repeated decimals do not drift', async () => {
    const store = createPaymentsStore(createFakePaymentsDependencies({
      listPayments: vi.fn<PaymentsService['listPayments']>().mockResolvedValue({
        success: true,
        data: [
          { ...paymentA, id: 'payment-1', amount: 0.1, status: 'confirmed' },
          { ...paymentA, id: 'payment-2', amount: 0.2, status: 'confirmed' },
          { ...paymentA, id: 'payment-3', amount: 5, status: 'pending' },
        ],
      }),
    }))

    await store.loadPayments(kindergartenA)

    expect(store.confirmedTotal).toBe(0.3)
  })
})

describe('paymentCountByStatus', () => {
  it('counts loaded payments per status', async () => {
    const store = createPaymentsStore(createFakePaymentsDependencies({
      listPayments: vi.fn<PaymentsService['listPayments']>().mockResolvedValue({
        success: true,
        data: [
          { ...paymentA, id: 'payment-1', status: 'pending' },
          { ...paymentA, id: 'payment-2', status: 'confirmed' },
          { ...paymentA, id: 'payment-3', status: 'confirmed' },
          { ...paymentA, id: 'payment-4', status: 'failed' },
        ],
      }),
    }))

    await store.loadPayments(kindergartenA)

    expect(store.paymentCountByStatus).toEqual({ pending: 1, confirmed: 2, failed: 1 })
  })
})
