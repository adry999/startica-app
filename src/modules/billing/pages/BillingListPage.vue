<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppErrorMessage } from '@shared/composables/useAppErrorMessage'
import { useLocaleFormat } from '@shared/composables/useLocaleFormat'
import { useTenantStore } from '@shared/session/tenant.store'
import { useBillingStore } from '../stores/billing.store'
import type { InvoiceStatus } from '../types/billing.types'

const { t } = useI18n()
const toast = useToast()
const describeAppError = useAppErrorMessage()
const { formatCurrency, formatCalendarDate } = useLocaleFormat()
const tenantStore = useTenantStore()
const billingStore = useBillingStore()
const { invoices, summary, isSummaryOutdated, status, loadError } = storeToRefs(billingStore)

const selectedKindergartenId = computed(() => tenantStore.selectedKindergartenId)

const { refresh } = useLazyAsyncData('billing-invoices', async () => {
  if (!selectedKindergartenId.value) return false
  return billingStore.loadInvoices(selectedKindergartenId.value)
}, { watch: [selectedKindergartenId] })

const failureMessage = computed(() => loadError.value ? describeAppError(loadError.value) : '')

type StatusFilter = 'all' | InvoiceStatus
const statusFilter = ref<StatusFilter>('all')

const invoiceStatuses: InvoiceStatus[] = ['draft', 'issued', 'paid', 'overdue', 'cancelled']

const statusFilterOptions = computed<Array<{ label: string, value: StatusFilter }>>(() => [
  { label: t('billing.filter.all'), value: 'all' },
  ...invoiceStatuses.map(invoiceStatus => ({ label: t(`billing.status.${invoiceStatus}`), value: invoiceStatus })),
])

const filteredInvoices = computed(() => statusFilter.value === 'all'
  ? invoices.value
  : invoices.value.filter(invoice => invoice.status === statusFilter.value))

const badgeColorByStatus: Record<InvoiceStatus, 'neutral' | 'info' | 'success' | 'error'> = {
  draft: 'neutral',
  issued: 'info',
  paid: 'success',
  overdue: 'error',
  cancelled: 'neutral',
}

async function onMarkPaid(invoiceId: string) {
  const result = await billingStore.markInvoicePaid(invoiceId)
  if (result.success) {
    toast.add({ title: t('billing.markPaidSuccess'), color: 'success' })
    return
  }
  toast.add({ title: describeAppError(result.error), color: 'error' })
}
</script>

<template>
  <div class="space-y-6">
    <BasePageHeader :title="t('billing.pageTitle')" :subtitle="t('billing.pageSubtitle')" />

    <UAlert v-if="!selectedKindergartenId" color="neutral" variant="soft" :description="t('billing.selectKindergarten')" />

    <div v-else-if="status === 'loading'" class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <BaseStatCard v-for="n in 4" :key="n" :label="t('common.loading')" loading />
    </div>

    <UAlert v-else-if="status === 'failed'" color="error" variant="soft" :description="failureMessage">
      <template #actions>
        <UButton color="error" variant="soft" size="xs" @click="() => refresh()">{{ t('common.retry') }}</UButton>
      </template>
    </UAlert>

    <div v-else-if="status === 'empty'" class="rounded-xl border border-border bg-white py-16 text-center text-sm text-slate-500">
      {{ t('billing.noInvoices') }}
    </div>

    <template v-else>
      <UAlert v-if="isSummaryOutdated" color="warning" variant="soft" :description="t('billing.summaryOutdated')">
        <template #actions>
          <UButton color="warning" variant="soft" size="xs" @click="() => refresh()">{{ t('common.retry') }}</UButton>
        </template>
      </UAlert>

      <div v-if="summary" class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <BaseStatCard :label="t('billing.stats.totalIssued')" :value="formatCurrency(summary.totalIssued)" icon="i-heroicons-document-text" icon-class="bg-blue-50 text-blue-600" />
        <BaseStatCard :label="t('billing.stats.totalPaid')" :value="formatCurrency(summary.totalPaid)" icon="i-heroicons-check-circle" icon-class="bg-green-50 text-green-600" />
        <BaseStatCard :label="t('billing.stats.totalOverdue')" :value="formatCurrency(summary.totalOverdue)" icon="i-heroicons-exclamation-circle" icon-class="bg-red-50 text-red-600" />
        <BaseStatCard :label="t('billing.stats.pending')" :value="summary.pendingCount" icon="i-heroicons-clock" icon-class="bg-yellow-50 text-yellow-600" />
      </div>

      <div class="rounded-xl border border-border bg-white p-6">
        <div class="mb-4 flex items-center gap-2">
          <span class="text-sm font-medium text-slate-700">{{ t('billing.filterLabel') }}</span>
          <USelect v-model="statusFilter" :items="statusFilterOptions" class="w-48" />
        </div>

        <div v-if="filteredInvoices.length === 0" class="text-center text-sm text-slate-500">{{ t('billing.noInvoices') }}</div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-border bg-slate-50">
              <tr>
                <th class="px-4 py-3 text-left font-medium text-slate-700">{{ t('billing.childName') }}</th>
                <th class="px-4 py-3 text-right font-medium text-slate-700">{{ t('billing.amount') }}</th>
                <th class="px-4 py-3 text-left font-medium text-slate-700">{{ t('billing.dueDate') }}</th>
                <th class="px-4 py-3 text-left font-medium text-slate-700">{{ t('billing.statusLabel') }}</th>
                <th class="px-4 py-3 text-left font-medium text-slate-700">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="invoice in filteredInvoices" :key="invoice.id" class="hover:bg-slate-50">
                <td class="px-4 py-3 text-slate-800">{{ invoice.childName }}</td>
                <td class="px-4 py-3 text-right font-medium text-slate-800">{{ formatCurrency(invoice.amount) }}</td>
                <td class="px-4 py-3 text-slate-600">{{ formatCalendarDate(invoice.dueDate) }}</td>
                <td class="px-4 py-3">
                  <UBadge :color="badgeColorByStatus[invoice.status]" variant="soft">
                    {{ t(`billing.status.${invoice.status}`) }}
                  </UBadge>
                </td>
                <td class="px-4 py-3">
                  <UButton
                    v-if="invoice.status === 'issued' || invoice.status === 'overdue'"
                    color="primary"
                    variant="link"
                    size="sm"
                    :loading="billingStore.isSettling(invoice.id)"
                    @click="onMarkPaid(invoice.id)"
                  >
                    {{ t('billing.markPaid') }}
                  </UButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
