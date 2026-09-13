<script setup lang="ts">
import { ref, computed } from 'vue'
import { useBilling } from '../composables/useBilling'
import { useTenantStore } from '@shared/session/tenant.store'

const { t } = useI18n()
const toast = useToast()
const tenantStore = useTenantStore()
const { items, summary, loading, fetchAll, fetchSummary, markAsPaid } = useBilling()

const selectedKgId = computed(() => tenantStore.selectedKindergartenId)
const statusFilter = ref<'all' | 'draft' | 'issued' | 'paid' | 'overdue'>('all')

useLazyAsyncData('billing', async () => {
  if (!selectedKgId.value) return true
  await fetchAll(selectedKgId.value)
  await fetchSummary(selectedKgId.value)
  return true
}, { watch: [selectedKgId] })

const filteredItems = computed(() => {
  if (statusFilter.value === 'all') return items.value
  return items.value.filter(i => i.status === statusFilter.value)
})

const statusOptions = [
  { label: t('billing.filter.all'), value: 'all' },
  { label: t('billing.status.draft'), value: 'draft' },
  { label: t('billing.status.issued'), value: 'issued' },
  { label: t('billing.status.paid'), value: 'paid' },
  { label: t('billing.status.overdue'), value: 'overdue' },
]

async function onMarkPaid(invoiceId: string) {
  const ok = await markAsPaid(invoiceId)
  if (ok) {
    toast.add({ title: t('billing.markPaidSuccess'), color: 'success' })
    if (selectedKgId.value) await fetchSummary(selectedKgId.value)
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(amount)
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('ro-RO')
}
</script>

<template>
  <div class="space-y-6">
    <BasePageHeader :title="t('billing.pageTitle')" :subtitle="t('billing.pageSubtitle')" />

    <div v-if="selectedKgId && summary" class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <BaseStatCard :label="t('billing.stats.totalIssued')" :value="formatCurrency(summary.totalIssued)" icon="i-heroicons-document-text" icon-class="bg-blue-50 text-blue-600" />
      <BaseStatCard :label="t('billing.stats.totalPaid')" :value="formatCurrency(summary.totalPaid)" icon="i-heroicons-check-circle" icon-class="bg-green-50 text-green-600" />
      <BaseStatCard :label="t('billing.stats.totalOverdue')" :value="formatCurrency(summary.totalOverdue)" icon="i-heroicons-exclamation-circle" icon-class="bg-red-50 text-red-600" />
      <BaseStatCard :label="t('billing.stats.pending')" :value="summary.pendingCount" icon="i-heroicons-clock" icon-class="bg-yellow-50 text-yellow-600" />
    </div>

    <div class="rounded-xl border border-border bg-white p-6">
      <div class="mb-4 flex items-center gap-2">
        <span class="text-sm font-medium text-slate-700">{{ t('billing.filterLabel') }}</span>
        <select v-model="statusFilter" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>

      <div v-if="loading" class="text-center text-sm text-slate-500">{{ t('common.loading') }}</div>
      <div v-else-if="!filteredItems.length" class="text-center text-sm text-slate-500">{{ t('billing.noInvoices') }}</div>
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
            <tr v-for="invoice in filteredItems" :key="invoice.id" class="hover:bg-slate-50">
              <td class="px-4 py-3 text-slate-800">{{ invoice.childName }}</td>
              <td class="px-4 py-3 text-right font-medium text-slate-800">{{ formatCurrency(invoice.amount) }}</td>
              <td class="px-4 py-3 text-slate-600">{{ formatDate(invoice.dueDate) }}</td>
              <td class="px-4 py-3">
                <span :class="['inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', {
                  'bg-gray-100 text-gray-800': invoice.status === 'draft',
                  'bg-blue-100 text-blue-800': invoice.status === 'issued',
                  'bg-green-100 text-green-800': invoice.status === 'paid',
                  'bg-red-100 text-red-800': invoice.status === 'overdue',
                }]">
                  {{ t(`billing.status.${invoice.status}`) }}
                </span>
              </td>
              <td class="px-4 py-3">
                <button
                  v-if="invoice.status === 'issued' || invoice.status === 'overdue'"
                  @click="onMarkPaid(invoice.id)"
                  class="text-sm font-medium text-teal-600 hover:text-teal-700"
                >
                  {{ t('billing.markPaid') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
