<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppErrorMessage } from '@shared/composables/useAppErrorMessage'
import { expenseCategories, type ExpenseInput } from '@shared/schemas/expense.schema'
import { todayAsCalendarDate } from '@shared/utils/calendarDate'
import { useExpensesStore } from '../stores/expenses.store'

const props = defineProps<{ open: boolean, kindergartenId: string }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const { t } = useI18n()
const toast = useToast()
const describeAppError = useAppErrorMessage()
const expensesStore = useExpensesStore()
const { isRecordingExpense } = storeToRefs(expensesStore)

function emptyExpenseForm(): ExpenseInput {
  return {
    kindergartenId: props.kindergartenId,
    category: 'other',
    amount: 0,
    expenseDate: todayAsCalendarDate(),
    description: '',
  }
}

const expenseForm = reactive<ExpenseInput>(emptyExpenseForm())

const isOpen = computed({
  get: () => props.open,
  set: (open: boolean) => emit('update:open', open),
})

watch(() => [props.open, props.kindergartenId] as const, ([open]) => {
  if (open) Object.assign(expenseForm, emptyExpenseForm())
})

const categoryOptions = computed(() => expenseCategories.map(category => ({
  label: t(`expenses.categories.${category}`),
  value: category,
})))

async function submitExpense() {
  const result = await expensesStore.recordExpense({ ...expenseForm })
  if (result.success) {
    toast.add({ title: t('expenses.recordSuccess'), color: 'success' })
    isOpen.value = false
    return
  }
  toast.add({ title: describeAppError(result.error), color: 'error' })
}
</script>

<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <div class="space-y-4 rounded-xl border border-border bg-white p-6">
        <h3 class="text-lg font-semibold text-gray-900">{{ t('expenses.create') }}</h3>

        <div class="space-y-3">
          <UFormField :label="t('expenses.category')">
            <USelect v-model="expenseForm.category" :items="categoryOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('expenses.amount')">
            <UInput v-model="expenseForm.amount" type="number" step="0.01" class="w-full" />
          </UFormField>
          <UFormField :label="t('expenses.expenseDate')">
            <UInput v-model="expenseForm.expenseDate" type="date" class="w-full" />
          </UFormField>
          <UFormField :label="t('expenses.description')">
            <UTextarea v-model="expenseForm.description" :rows="3" class="w-full" />
          </UFormField>
        </div>

        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="soft" @click="isOpen = false">{{ t('common.cancel') }}</UButton>
          <UButton color="primary" :loading="isRecordingExpense" @click="submitExpense">{{ t('common.create') }}</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
