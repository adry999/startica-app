import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createLatestRequestGuard } from '@core/async/latest-request'
import { sessionExpiredError, type AppError } from '@core/errors/app-error'
import type { PaymentInput } from '@shared/schemas/payment.schema'
import type { Result } from '@shared/types/result'
import type { ScreenStatus } from '@shared/types/screen-status'
import { injectPaymentsDependencies } from '../payments.dependencies'
import type { PayableInvoice, Payment, PaymentStatus } from '../types/payments.types'

export const usePaymentsStore = defineStore('payments', () => {
  const { paymentsService, listPayableInvoices, readCurrentActorId } = injectPaymentsDependencies()
  const paymentRequests = createLatestRequestGuard()

  const payments = ref<Payment[]>([])
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

  const paymentCountByStatus = computed(() => {
    const counts: Record<PaymentStatus, number> = { pending: 0, confirmed: 0, failed: 0 }
    for (const payment of payments.value) counts[payment.status] += 1
    return counts
  })

  // Summed in cents so repeated two-decimal amounts do not drift.
  const confirmedTotal = computed(() => payments.value
    .filter(payment => payment.status === 'confirmed')
    .reduce((totalCents, payment) => totalCents + Math.round(payment.amount * 100), 0) / 100)

  async function loadPayments(kindergartenId: string): Promise<boolean> {
    const request = paymentRequests.begin()
    if (loadedKindergartenId.value !== kindergartenId) {
      payments.value = []
      payableInvoices.value = []
      loadedKindergartenId.value = kindergartenId
    }
    loadPhase.value = 'loading'
    loadError.value = null
    payableInvoicesError.value = null

    const [paymentsResult, payableInvoicesResult] = await Promise.all([
      paymentsService.listPayments(kindergartenId),
      listPayableInvoices(kindergartenId),
    ])
    if (!request.isLatest()) return false

    // Recording a payment needs the invoice list; reading the ledger does not.
    if (payableInvoicesResult.success) payableInvoices.value = payableInvoicesResult.data
    else payableInvoicesError.value = payableInvoicesResult.error

    if (!paymentsResult.success) {
      loadError.value = paymentsResult.error
      loadPhase.value = 'failed'
      return false
    }
    payments.value = paymentsResult.data
    loadPhase.value = 'loaded'
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
    payableInvoices,
    payableInvoicesError,
    loadedKindergartenId,
    loadPhase,
    loadError,
    confirmingPaymentIds,
    isRecordingPayment,
    status,
    paymentCountByStatus,
    confirmedTotal,
    loadPayments,
    recordPayment,
    confirmPayment,
    isConfirming,
  }
})
