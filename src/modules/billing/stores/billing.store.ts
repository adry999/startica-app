import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createLatestRequestGuard } from '@core/async/latest-request'
import { sessionExpiredError, type AppError } from '@core/errors/app-error'
import type { Result } from '@shared/types/result'
import type { ScreenStatus } from '@shared/types/screen-status'
import { injectBillingDependencies } from '../billing.dependencies'
import type { Invoice, InvoiceSummary } from '../types/billing.types'

export const useBillingStore = defineStore('billing', () => {
  const { billingService, readCurrentActorId } = injectBillingDependencies()
  const invoiceRequests = createLatestRequestGuard()

  const invoices = ref<Invoice[]>([])
  const summary = ref<InvoiceSummary | null>(null)
  const loadedKindergartenId = ref<string | null>(null)
  const loadPhase = ref<'loading' | 'loaded' | 'failed'>('loading')
  const loadError = ref<AppError | null>(null)
  const settlingInvoiceIds = ref<string[]>([])

  const status = computed<ScreenStatus>(() => {
    if (loadPhase.value !== 'loaded') return loadPhase.value
    return invoices.value.length > 0 ? 'ready' : 'empty'
  })

  function failLoad(error: AppError): false {
    loadError.value = error
    loadPhase.value = 'failed'
    return false
  }

  async function loadInvoices(kindergartenId: string): Promise<boolean> {
    const request = invoiceRequests.begin()
    if (loadedKindergartenId.value !== kindergartenId) {
      invoices.value = []
      summary.value = null
      loadedKindergartenId.value = kindergartenId
    }
    loadPhase.value = 'loading'
    loadError.value = null

    const [invoicesResult, summaryResult] = await Promise.all([
      billingService.listInvoices(kindergartenId),
      billingService.getSummary(kindergartenId),
    ])
    if (!request.isLatest()) return false
    if (!invoicesResult.success) return failLoad(invoicesResult.error)
    if (!summaryResult.success) return failLoad(summaryResult.error)

    invoices.value = invoicesResult.data
    summary.value = summaryResult.data
    loadPhase.value = 'loaded'
    return true
  }

  async function refreshSummary(kindergartenId: string) {
    const summaryResult = await billingService.getSummary(kindergartenId)
    if (loadedKindergartenId.value !== kindergartenId) return
    if (summaryResult.success) {
      summary.value = summaryResult.data
      return
    }
    // The invoice is already paid; a stale summary must not report the payment as failed.
    console.warn('[billing] summary refresh failed after settling an invoice', { kindergartenId, error: summaryResult.error })
  }

  async function markInvoicePaid(invoiceId: string): Promise<Result<Invoice, AppError>> {
    const actorId = readCurrentActorId()
    const kindergartenId = loadedKindergartenId.value
    if (!actorId) return { success: false, error: sessionExpiredError }
    if (!kindergartenId) return { success: false, error: { kind: 'refused', reason: 'not_found' } }

    settlingInvoiceIds.value = [...settlingInvoiceIds.value, invoiceId]
    try {
      const result = await billingService.markInvoicePaid({ invoiceId, kindergartenId, actorId })
      if (result.success && loadedKindergartenId.value === kindergartenId) {
        invoices.value = invoices.value.map(invoice => (invoice.id === invoiceId ? result.data : invoice))
        await refreshSummary(kindergartenId)
      }
      return result
    }
    finally {
      settlingInvoiceIds.value = settlingInvoiceIds.value.filter(id => id !== invoiceId)
    }
  }

  function isSettling(invoiceId: string): boolean {
    return settlingInvoiceIds.value.includes(invoiceId)
  }

  return {
    invoices,
    summary,
    loadedKindergartenId,
    loadPhase,
    loadError,
    settlingInvoiceIds,
    status,
    loadInvoices,
    markInvoicePaid,
    isSettling,
  }
})
