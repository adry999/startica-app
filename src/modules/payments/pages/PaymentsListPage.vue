<template>
  <div class="space-y-6">
    <BasePageHeader :title="t('payments.pageTitle')" :subtitle="t('payments.pageSubtitle')" />

    <template v-if="selectedKgId">
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <BaseStatCard :label="t('payments.stats.total')" :value="formatCurrency(totalConfirmed)" icon="i-heroicons-credit-card" icon-class="bg-green-50 text-green-600" />
        <BaseStatCard :label="t('payments.stats.pending')" :value="String(pendingCount)" icon="i-heroicons-clock" icon-class="bg-yellow-50 text-yellow-600" />
        <BaseStatCard :label="t('payments.stats.confirmed')" :value="String(confirmedCount)" icon="i-heroicons-check-circle" icon-class="bg-blue-50 text-blue-600" />
        <BaseStatCard :label="t('payments.stats.failed')" :value="String(failedCount)" icon="i-heroicons-exclamation-circle" icon-class="bg-red-50 text-red-600" />
      </div>

      <div class="rounded-xl border border-border bg-white p-6">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900">
            {{ t('payments.title') }}
          </h2>
          <BaseButton icon="i-heroicons-plus-20-solid" @click="isCreateModalOpen = true">
            {{ t('payments.add') }}
          </BaseButton>
        </div>

        <div v-if="loading" class="text-center py-8 text-gray-500">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="items.length === 0" class="text-center py-8 text-gray-500">
          {{ t('payments.noPayments') }}
        </div>
        <div v-else class="space-y-3">
          <div v-for="payment in items" :key="payment.id" class="flex items-center justify-between border-b border-gray-200 py-3">
            <div class="space-y-1">
              <div class="flex items-center gap-3">
                <span class="font-medium text-gray-900">{{ formatCurrency(payment.amount) }}</span>
                <BaseBadge :color="statusColor(payment.status)">
                  {{ t(`payments.status.${payment.status}`) }}
                </BaseBadge>
              </div>
              <p class="text-sm text-gray-600">{{ payment.method }} • {{ formatDate(payment.paidDate) }}</p>
              <p v-if="payment.referenceNumber" class="text-xs text-gray-500">{{ t('payments.refNumber') }}: {{ payment.referenceNumber }}</p>
            </div>
            <BaseButton v-if="payment.status === 'pending'" size="sm" @click="confirmPayment(payment.id)" :loading="loading">
              {{ t('payments.confirm') }}
            </BaseButton>
          </div>
        </div>
      </div>

      <!-- Create Payment Modal -->
      <UModal v-model="isCreateModalOpen">
        <div class="rounded-xl border border-border bg-white p-6 space-y-4">
          <h3 class="text-lg font-semibold text-gray-900">{{ t('payments.create') }}</h3>

          <div class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-700">{{ t('payments.invoiceId') }}</label>
              <input v-model="createForm.invoiceId" type="text" class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">{{ t('payments.amount') }}</label>
              <input v-model.number="createForm.amount" type="number" step="0.01" class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">{{ t('payments.paidDate') }}</label>
              <input v-model="createForm.paidDate" type="date" class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">{{ t('payments.method') }}</label>
              <select v-model="createForm.method" class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2">
                <option value="bank_transfer">{{ t('payments.methods.bankTransfer') }}</option>
                <option value="cash">{{ t('payments.methods.cash') }}</option>
                <option value="check">{{ t('payments.methods.check') }}</option>
                <option value="online">{{ t('payments.methods.online') }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">{{ t('payments.refNumber') }}</label>
              <input v-model="createForm.referenceNumber" type="text" class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">{{ t('payments.notes') }}</label>
              <textarea v-model="createForm.notes" rows="3" class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" />
            </div>
          </div>

          <div class="flex gap-2 justify-end">
            <BaseButton color="gray" @click="isCreateModalOpen = false">{{ t('common.cancel') }}</BaseButton>
            <BaseButton @click="submitCreate" :loading="loading">{{ t('common.create') }}</BaseButton>
          </div>
        </div>
      </UModal>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { PaymentMethod } from '~/shared/schemas/payment.schema'
import { usePayments } from '../composables/usePayments'
import { useTenantStore } from '@shared/session/tenant.store'

const { t } = useI18n()
const tenantStore = useTenantStore()
const { items, loading, totalConfirmed, fetchByInvoice, create, confirm } = usePayments()

const isCreateModalOpen = ref(false)

function emptyPaymentForm() {
  return {
    invoiceId: '',
    amount: 0,
    paidDate: new Date().toISOString().split('T')[0] as string,
    method: 'bank_transfer' as PaymentMethod,
    referenceNumber: '',
    notes: '',
  }
}

const createForm = ref(emptyPaymentForm())

const selectedKgId = computed(() => tenantStore.selectedKindergartenId)

useLazyAsyncData('payments', async () => {
  if (!selectedKgId.value) return true
  await fetchByInvoice(selectedKgId.value, '')
  return true
}, { watch: [selectedKgId] })

const pendingCount = computed(() => items.value.filter(p => p.status === 'pending').length)
const confirmedCount = computed(() => items.value.filter(p => p.status === 'confirmed').length)
const failedCount = computed(() => items.value.filter(p => p.status === 'failed').length)

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(amount)
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('ro-RO')
}

function statusColor(status: string): string {
  switch (status) {
    case 'pending': return 'yellow'
    case 'confirmed': return 'green'
    case 'failed': return 'red'
    default: return 'gray'
  }
}

async function submitCreate() {
  if (!selectedKgId.value) return
  const success = await create({
    kindergartenId: selectedKgId.value,
    ...createForm.value,
  })
  if (success) {
    isCreateModalOpen.value = false
    createForm.value = emptyPaymentForm()
  }
}

async function confirmPayment(id: string) {
  await confirm(id)
}
</script>
