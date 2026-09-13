import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createLatestRequestGuard } from '@core/async/latest-request'
import { sessionExpiredError, type AppError } from '@core/errors/app-error'
import type { PaymentInput } from '@shared/schemas/payment.schema'
import type { Result } from '@shared/types/result'
import type { ScreenStatus } from '@shared/types/screen-status'
import { injectPaymentsDependencies } from '../payments.dependencies'
import type { PayableInvoice, Payment, PaymentSummary } from '../types/payments.types'

export const usePaymentsStore = defineStore('payments', () => {
  const { paymentsService, listPayableInvoices, readCurrentActorId } = injectPaymentsDependencies()
  const paymentRequests = createLatestRequestGuard()
  const summaryRequests = createLatestRequestGuard()
  const payableInvoiceRequests = createLatestRequestGuard()

  const payments = ref<Payment[]>([])
  const summary = ref<PaymentSummary | null>(null)
  const isSummaryOutdated = ref(false)
  const payableInvoices = ref<PayableInvoice[]>([])
  const payableInvoicesError = ref<AppError | null>(null)
  const loadedKindergartenId = ref<string | null>(null)
  const loadPhase = ref<'loading' | 'loaded' | 'failed'>('loading')
  const loadError = ref<AppError | null>(null)
  const confirmingPaymentIds = ref<string[]>([])
  const isRecordingPayment = ref(false)

  const status = computed<ScreenStatus>(() => {
    if (loadPhase.value !== 'loaded') return loadPhase.value
    return payments.value.length > 0 ? 'ready' : 'empty'
  })

  function failLoad(error: AppError): false {
    loadError.value = error
    loadPhase.value = 'failed'
    return false
  }

  async function loadPayments(kindergartenId: string): Promise<boolean> {
    const request = paymentRequests.begin()
    summaryRequests.supersede()
    if (loadedKindergartenId.value !== kindergartenId) {
      payments.value = []
      summary.value = null
      payableInvoices.value = []
      loadedKindergartenId.value = kindergartenId
    }
    loadPhase.value = 'loading'
    loadError.value = null

    // Recording a payment needs the invoice list; reading the ledger does not.
    const [paymentsResult, summaryResult] = await Promise.all([
      paymentsService.listPayments(kindergartenId),
      paymentsService.getSummary(kindergartenId),
      loadPayableInvoices(kindergartenId),
    ])
    if (!request.isLatest()) return false
    if (!paymentsResult.success) return failLoad(paymentsResult.error)
    if (!summaryResult.success) return failLoad(summaryResult.error)

    payments.value = paymentsResult.data
    summary.value = summaryResult.data
    isSummaryOutdated.value = false
    loadPhase.value = 'loaded'
    return true
  }

  async function refreshSummary(kindergartenId: string) {
    const request = summaryRequests.begin()
    const summaryResult = await paymentsService.getSummary(kindergartenId)
    if (!request.isLatest() || loadedKindergartenId.value !== kindergartenId) return
    // The payment change already succeeded; a failed refresh flags the totals instead of failing it.
    if (!summaryResult.success) {
      isSummaryOutdated.value = true
      return
    }
    summary.value = summaryResult.data
    isSummaryOutdated.value = false
  }

  async function loadPayableInvoices(kindergartenId: string): Promise<boolean> {
    const request = payableInvoiceRequests.begin()
    payableInvoicesError.value = null

    const result = await listPayableInvoices(kindergartenId)
    if (!request.isLatest() || loadedKindergartenId.value !== kindergartenId) return false

    if (!result.success) {
      // A list kept from an earlier load could offer invoices that no longer accept payments.
      payableInvoices.value = []
      payableInvoicesError.value = result.error
      return false
    }
    payableInvoices.value = result.data
    return true
  }

  async function recordPayment(input: PaymentInput): Promise<Result<Payment, AppError>> {
    const actorId = readCurrentActorId()
    if (!actorId) return { success: false, error: sessionExpiredError }

    isRecordingPayment.value = true
    try {
      const result = await paymentsService.recordPayment(input, actorId)
      if (result.success && loadedKindergartenId.value === result.data.kindergartenId) {
        payments.value = [result.data, ...payments.value]
        await refreshSummary(result.data.kindergartenId)
      }
      return result
    }
    finally {
      isRecordingPayment.value = false
    }
  }

  async function confirmPayment(paymentId: string): Promise<Result<Payment, AppError>> {
    const actorId = readCurrentActorId()
    const kindergartenId = loadedKindergartenId.value
    if (!actorId) return { success: false, error: sessionExpiredError }
    if (!kindergartenId) return { success: false, error: { kind: 'refused', reason: 'not_found' } }

    confirmingPaymentIds.value = [...confirmingPaymentIds.value, paymentId]
    try {
      const result = await paymentsService.confirmPayment({ paymentId, kindergartenId, actorId })
      if (result.success && loadedKindergartenId.value === kindergartenId) {
        payments.value = payments.value.map(payment => (payment.id === paymentId ? result.data : payment))
        await refreshSummary(kindergartenId)
      }
      return result
    }
    finally {
      confirmingPaymentIds.value = confirmingPaymentIds.value.filter(id => id !== paymentId)
    }
  }

  function isConfirming(paymentId: string): boolean {
    return confirmingPaymentIds.value.includes(paymentId)
  }

  return {
    payments,
    summary,
    isSummaryOutdated,
    payableInvoices,
    payableInvoicesError,
    loadedKindergartenId,
    loadPhase,
    loadError,
    confirmingPaymentIds,
    isRecordingPayment,
    status,
    loadPayments,
    loadPayableInvoices,
    recordPayment,
    confirmPayment,
    isConfirming,
  }
})
