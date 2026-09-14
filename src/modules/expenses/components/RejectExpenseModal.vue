<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAppErrorMessage } from '@shared/composables/useAppErrorMessage'
import { useExpensesStore } from '../stores/expenses.store'

const props = defineProps<{ expenseId: string | null }>()
const emit = defineEmits<{ 'update:expenseId': [expenseId: string | null] }>()

const { t } = useI18n()
const toast = useToast()
const describeAppError = useAppErrorMessage()
const expensesStore = useExpensesStore()

const rejectionReason = ref('')

const isOpen = computed({
  get: () => props.expenseId !== null,
  set: (open: boolean) => {
    if (!open) emit('update:expenseId', null)
  },
})

watch(() => props.expenseId, () => {
  rejectionReason.value = ''
})

const isSubmitting = computed(() => props.expenseId !== null && expensesStore.isDeciding(props.expenseId))
const canSubmit = computed(() => rejectionReason.value.trim().length > 0 && !isSubmitting.value)

async function submitRejection() {
  const expenseId = props.expenseId
  if (!expenseId) return
  const result = await expensesStore.rejectExpense(expenseId, rejectionReason.value)
  if (result.success) {
    toast.add({ title: t('expenses.rejectSuccess'), color: 'success' })
    emit('update:expenseId', null)
    return
  }
  toast.add({ title: describeAppError(result.error), color: 'error' })
}
</script>

<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <div class="space-y-4 rounded-xl border border-border bg-white p-6">
        <h3 class="text-lg font-semibold text-gray-900">{{ t('expenses.rejectTitle') }}</h3>

        <UFormField :label="t('expenses.rejectionReason')" :help="t('expenses.rejectionReasonHint')">
          <UTextarea v-model="rejectionReason" :rows="3" :maxlength="500" class="w-full" />
        </UFormField>

        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="soft" @click="isOpen = false">{{ t('common.cancel') }}</UButton>
          <UButton color="error" :loading="isSubmitting" :disabled="!canSubmit" @click="submitRejection">
            {{ t('expenses.reject') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
