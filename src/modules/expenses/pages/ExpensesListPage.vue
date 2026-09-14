<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppErrorMessage } from '@shared/composables/useAppErrorMessage'
import { useLocaleFormat } from '@shared/composables/useLocaleFormat'
import { useTenantStore } from '@shared/session/tenant.store'
import RecordExpenseModal from '../components/RecordExpenseModal.vue'
import RejectExpenseModal from '../components/RejectExpenseModal.vue'
import { useExpensesStore } from '../stores/expenses.store'
import type { ExpenseStatus } from '../types/expenses.types'

const { t } = useI18n()
const toast = useToast()
const describeAppError = useAppErrorMessage()
const { formatCurrency, formatCalendarDate } = useLocaleFormat()
const tenantStore = useTenantStore()
const expensesStore = useExpensesStore()
const { expenses, summary, isSummaryOutdated, draftCount, status, loadError } = storeToRefs(expensesStore)

const selectedKindergartenId = computed(() => tenantStore.selectedKindergartenId)

const { refresh } = useLazyAsyncData('expenses-list', async () => {
  if (!selectedKindergartenId.value) return false
  return expensesStore.loadExpenses(selectedKindergartenId.value)
}, { watch: [selectedKindergartenId] })

const failureMessage = computed(() => loadError.value ? describeAppError(loadError.value) : '')

const isRecordModalOpen = ref(false)
const rejectingExpenseId = ref<string | null>(null)

// A kindergarten switch must not leave a stale modal open over the new tenant's data.
watch(selectedKindergartenId, () => {
  isRecordModalOpen.value = false
  rejectingExpenseId.value = null
})

const badgeColorByStatus: Record<ExpenseStatus, 'neutral' | 'success' | 'error'> = {
  draft: 'neutral',
  approved: 'success',
  rejected: 'error',
}

async function onApprove(expenseId: string) {
  const result = await expensesStore.approveExpense(expenseId)
  if (result.success) {
    toast.add({ title: t('expenses.approveSuccess'), color: 'success' })
    return
  }
  toast.add({ title: describeAppError(result.error), color: 'error' })
}
</script>

<template>
  <div class="space-y-6">
    <BasePageHeader :title="t('expenses.pageTitle')" :subtitle="t('expenses.pageSubtitle')" />

    <UAlert v-if="!selectedKindergartenId" color="neutral" variant="soft" :description="t('expenses.selectKindergarten')" />

    <div v-else-if="status === 'loading'" class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <BaseStatCard v-for="n in 4" :key="n" :label="t('common.loading')" loading />
    </div>

    <UAlert v-else-if="status === 'failed'" color="error" variant="soft" :description="failureMessage">
      <template #actions>
        <UButton color="error" variant="soft" size="xs" @click="() => refresh()">{{ t('common.retry') }}</UButton>
      </template>
    </UAlert>

    <template v-else>
      <UAlert v-if="isSummaryOutdated" color="warning" variant="soft" :description="t('expenses.summaryOutdated')">
        <template #actions>
          <UButton color="warning" variant="soft" size="xs" @click="() => refresh()">{{ t('common.retry') }}</UButton>
        </template>
      </UAlert>

      <div v-if="summary" class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <BaseStatCard :label="t('expenses.stats.totalSpent')" :value="formatCurrency(summary.totalSpent)" icon="i-heroicons-banknotes" icon-class="bg-red-50 text-red-600" />
        <BaseStatCard :label="t('expenses.stats.approved')" :value="formatCurrency(summary.totalApproved)" icon="i-heroicons-check-circle" icon-class="bg-green-50 text-green-600" />
        <BaseStatCard :label="t('expenses.stats.pending')" :value="formatCurrency(summary.totalPending)" icon="i-heroicons-clock" icon-class="bg-yellow-50 text-yellow-600" />
        <BaseStatCard :label="t('expenses.stats.drafts')" :value="draftCount" icon="i-heroicons-document" icon-class="bg-blue-50 text-blue-600" />
      </div>

      <div class="rounded-xl border border-border bg-white p-6">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900">{{ t('expenses.title') }}</h2>
          <UButton icon="i-heroicons-plus-20-solid" @click="isRecordModalOpen = true">
            {{ t('expenses.add') }}
          </UButton>
        </div>

        <div v-if="status === 'empty'" class="py-8 text-center text-gray-500">
          {{ t('expenses.noExpenses') }}
        </div>
        <div v-else class="space-y-3">
          <div v-for="expense in expenses" :key="expense.id" class="flex items-center justify-between border-b border-gray-200 py-3">
            <div class="space-y-1">
              <div class="flex items-center gap-3">
                <span class="font-medium text-gray-900">{{ formatCurrency(expense.amount) }}</span>
                <UBadge :color="badgeColorByStatus[expense.status]" variant="soft">
                  {{ t(`expenses.status.${expense.status}`) }}
                </UBadge>
              </div>
              <p class="text-sm text-gray-600">{{ t(`expenses.categories.${expense.category}`) }} • {{ formatCalendarDate(expense.expenseDate) }}</p>
              <p v-if="expense.description" class="text-xs text-gray-500">{{ expense.description }}</p>
            </div>
            <div v-if="expense.status === 'draft'" class="flex items-center gap-2">
              <UButton
                size="sm"
                :loading="expensesStore.isDeciding(expense.id)"
                :disabled="expensesStore.isDeciding(expense.id)"
                @click="onApprove(expense.id)"
              >
                {{ t('expenses.approve') }}
              </UButton>
              <UButton
                size="sm"
                color="error"
                variant="soft"
                :disabled="expensesStore.isDeciding(expense.id)"
                @click="rejectingExpenseId = expense.id"
              >
                {{ t('expenses.reject') }}
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <RecordExpenseModal v-model:open="isRecordModalOpen" :kindergarten-id="selectedKindergartenId" />
      <RejectExpenseModal v-model:expense-id="rejectingExpenseId" />
    </template>
  </div>
</template>
