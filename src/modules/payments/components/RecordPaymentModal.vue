<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppErrorMessage } from '@shared/composables/useAppErrorMessage'
import { useLocaleFormat } from '@shared/composables/useLocaleFormat'
import { paymentMethods, type PaymentInput } from '@shared/schemas/payment.schema'
import { usePaymentsStore } from '../stores/payments.store'

const props = defineProps<{ open: boolean, kindergartenId: string }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const { t } = useI18n()
const toast = useToast()
const describeAppError = useAppErrorMessage()
const { formatCurrency, formatCalendarDate } = useLocaleFormat()
const paymentsStore = usePaymentsStore()
const { payableInvoices, payableInvoicesError, isRecordingPayment } = storeToRefs(paymentsStore)

function todayAsCalendarDate(): string {
  const now = new Date()
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map(part => String(part).padStart(2, '0'))
    .join('-')
}

function emptyPaymentForm(): PaymentInput {
  return {
    kindergartenId: props.kindergartenId,
    invoiceId: '',
    amount: 0,
    paidDate: todayAsCalendarDate(),
    method: 'bank_transfer',
    referenceNumber: '',
    notes: '',
  }
}

const paymentForm = reactive<PaymentInput>(emptyPaymentForm())

const isOpen = computed({
  get: () => props.open,
  set: (open: boolean) => emit('update:open', open),
})

watch(() => [props.open, props.kindergartenId] as const, ([open]) => {
  if (open) Object.assign(paymentForm, emptyPaymentForm())
})

const invoiceOptions = computed(() => payableInvoices.value.map(invoice => ({
  label: `${invoice.childName} — ${formatCurrency(invoice.amount)} — ${formatCalendarDate(invoice.dueDate)}`,
  value: invoice.id,
})))

const methodOptions = computed(() => paymentMethods.map(method => ({
  label: t(`payments.methods.${method}`),
  value: method,
})))

const canSubmit = computed(() => !isRecordingPayment.value
  && invoiceOptions.value.some(option => option.value === paymentForm.invoiceId))

function retryPayableInvoices() {
  paymentsStore.loadPayableInvoices(props.kindergartenId)
}

function close() {
  isOpen.value = false
}

async function submitPayment() {
  const result = await paymentsStore.recordPayment({ ...paymentForm })
  if (result.success) {
    toast.add({ title: t('payments.recordSuccess'), color: 'success' })
    close()
    return
  }
  toast.add({ title: describeAppError(result.error), color: 'error' })
}
</script>

<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <div class="space-y-4 rounded-xl border border-border bg-white p-6">
        <h3 class="text-lg font-semibold text-gray-900">{{ t('payments.create') }}</h3>

        <UAlert v-if="payableInvoicesError" color="error" variant="soft" :description="t('payments.payableInvoicesUnavailable')">
          <template #actions>
            <UButton color="error" variant="soft" size="xs" @click="retryPayableInvoices">{{ t('common.retry') }}</UButton>
          </template>
        </UAlert>
        <UAlert v-else-if="invoiceOptions.length === 0" color="neutral" variant="soft" :description="t('payments.noPayableInvoices')" />

        <div class="space-y-3">
          <UFormField :label="t('payments.invoiceId')">
            <USelect v-model="paymentForm.invoiceId" :items="invoiceOptions" :placeholder="t('payments.selectInvoice')" class="w-full" />
          </UFormField>
          <UFormField :label="t('payments.amount')">
            <UInput v-model="paymentForm.amount" type="number" step="0.01" class="w-full" />
          </UFormField>
          <UFormField :label="t('payments.paidDate')">
            <UInput v-model="paymentForm.paidDate" type="date" class="w-full" />
          </UFormField>
          <UFormField :label="t('payments.method')">
            <USelect v-model="paymentForm.method" :items="methodOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('payments.refNumber')">
            <UInput v-model="paymentForm.referenceNumber" class="w-full" />
          </UFormField>
          <UFormField :label="t('payments.notes')">
            <UTextarea v-model="paymentForm.notes" :rows="3" class="w-full" />
          </UFormField>
        </div>

        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="soft" @click="close">{{ t('common.cancel') }}</UButton>
          <UButton color="primary" :loading="isRecordingPayment" :disabled="!canSubmit" @click="submitPayment">{{ t('common.create') }}</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
