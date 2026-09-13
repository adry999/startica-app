<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppErrorMessage } from '@shared/composables/useAppErrorMessage'
import { useLocaleFormat } from '@shared/composables/useLocaleFormat'
import { useTenantStore } from '@shared/session/tenant.store'
import RecordPaymentModal from '../components/RecordPaymentModal.vue'
import { usePaymentsStore } from '../stores/payments.store'
import type { PaymentStatus } from '../types/payments.types'

const { t, te } = useI18n()
const toast = useToast()
const describeAppError = useAppErrorMessage()
const { formatCurrency, formatCalendarDate } = useLocaleFormat()
const tenantStore = useTenantStore()
const paymentsStore = usePaymentsStore()
const { payments, summary, isSummaryOutdated, status, loadError } = storeToRefs(paymentsStore)

const selectedKindergartenId = computed(() => tenantStore.selectedKindergartenId)

const { refresh } = useLazyAsyncData('payments-list', async () => {
  if (!selectedKindergartenId.value) return false
  return paymentsStore.loadPayments(selectedKindergartenId.value)
}, { watch: [selectedKindergartenId] })

const failureMessage = computed(() => loadError.value ? describeAppError(loadError.value) : '')

const isRecordModalOpen = ref(false)

const badgeColorByStatus: Record<PaymentStatus, 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  confirmed: 'success',
  failed: 'error',
}

function paymentMethodLabel(method: string): string {
  const labelKey = `payments.methods.${method}`
  return te(labelKey) ? t(labelKey) : method
}

async function onConfirm(paymentId: string) {
  const result = await paymentsStore.confirmPayment(paymentId)
  if (result.success) {
    toast.add({ title: t('payments.confirmSuccess'), color: 'success' })
    return
  }
  toast.add({ title: describeAppError(result.error), color: 'error' })
}
</script>

<template>
  <div class="space-y-6">
    <BasePageHeader :title="t('payments.pageTitle')" :subtitle="t('payments.pageSubtitle')" />

    <UAlert v-if="!selectedKindergartenId" color="neutral" variant="soft" :description="t('payments.selectKindergarten')" />

    <div v-else-if="status === 'loading'" class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <BaseStatCard v-for="n in 4" :key="n" :label="t('common.loading')" loading />
    </div>

    <UAlert v-else-if="status === 'failed'" color="error" variant="soft" :description="failureMessage">
      <template #actions>
        <UButton color="error" variant="soft" size="xs" @click="() => refresh()">{{ t('common.retry') }}</UButton>
      </template>
    </UAlert>

    <template v-else>
      <UAlert v-if="isSummaryOutdated" color="warning" variant="soft" :description="t('payments.summaryOutdated')">
        <template #actions>
          <UButton color="warning" variant="soft" size="xs" @click="() => refresh()">{{ t('common.retry') }}</UButton>
        </template>
      </UAlert>

      <div v-if="summary" class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <BaseStatCard :label="t('payments.stats.total')" :value="formatCurrency(summary.confirmedTotal)" icon="i-heroicons-credit-card" icon-class="bg-green-50 text-green-600" />
        <BaseStatCard :label="t('payments.stats.pending')" :value="summary.pendingCount" icon="i-heroicons-clock" icon-class="bg-yellow-50 text-yellow-600" />
        <BaseStatCard :label="t('payments.stats.confirmed')" :value="summary.confirmedCount" icon="i-heroicons-check-circle" icon-class="bg-blue-50 text-blue-600" />
        <BaseStatCard :label="t('payments.stats.failed')" :value="summary.failedCount" icon="i-heroicons-exclamation-circle" icon-class="bg-red-50 text-red-600" />
      </div>

      <div class="rounded-xl border border-border bg-white p-6">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900">{{ t('payments.title') }}</h2>
          <UButton icon="i-heroicons-plus-20-solid" @click="isRecordModalOpen = true">
            {{ t('payments.add') }}
          </UButton>
        </div>

        <div v-if="status === 'empty'" class="text-center py-8 text-gray-500">
          {{ t('payments.noPayments') }}
        </div>
        <div v-else class="space-y-3">
          <div v-for="payment in payments" :key="payment.id" class="flex items-center justify-between border-b border-gray-200 py-3">
            <div class="space-y-1">
              <div class="flex items-center gap-3">
                <span class="font-medium text-gray-900">{{ formatCurrency(payment.amount) }}</span>
                <UBadge :color="badgeColorByStatus[payment.status]" variant="soft">
                  {{ t(`payments.status.${payment.status}`) }}
                </UBadge>
              </div>
              <p class="text-sm text-gray-600">{{ paymentMethodLabel(payment.method) }} • {{ formatCalendarDate(payment.paidDate) }}</p>
              <p v-if="payment.referenceNumber" class="text-xs text-gray-500">{{ t('payments.refNumber') }}: {{ payment.referenceNumber }}</p>
            </div>
            <UButton
              v-if="payment.status === 'pending'"
              size="sm"
              :loading="paymentsStore.isConfirming(payment.id)"
              @click="onConfirm(payment.id)"
            >
              {{ t('payments.confirm') }}
            </UButton>
          </div>
        </div>
      </div>

      <RecordPaymentModal v-model:open="isRecordModalOpen" :kindergarten-id="selectedKindergartenId" />
    </template>
  </div>
</template>
