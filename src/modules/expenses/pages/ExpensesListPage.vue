<template>
  <div class="space-y-6">
    <BasePageHeader :title="t('expenses.pageTitle')" :subtitle="t('expenses.pageSubtitle')" />

    <template v-if="selectedKgId">
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <BaseStatCard :label="t('expenses.stats.totalSpent')" :value="formatCurrency(summary?.totalSpent ?? 0)" icon="i-heroicons-banknotes" icon-class="bg-red-50 text-red-600" />
        <BaseStatCard :label="t('expenses.stats.approved')" :value="formatCurrency(summary?.totalApproved ?? 0)" icon="i-heroicons-check-circle" icon-class="bg-green-50 text-green-600" />
        <BaseStatCard :label="t('expenses.stats.pending')" :value="formatCurrency(summary?.totalPending ?? 0)" icon="i-heroicons-clock" icon-class="bg-yellow-50 text-yellow-600" />
        <BaseStatCard :label="t('expenses.stats.drafts')" :value="String(draftCount)" icon="i-heroicons-document" icon-class="bg-blue-50 text-blue-600" />
      </div>

      <div class="rounded-xl border border-border bg-white p-6">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900">{{ t('expenses.title') }}</h2>
          <BaseButton icon="i-heroicons-plus-20-solid" @click="isCreateModalOpen = true">
            {{ t('expenses.add') }}
          </BaseButton>
        </div>

        <div v-if="loading" class="text-center py-8 text-gray-500">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="items.length === 0" class="text-center py-8 text-gray-500">
          {{ t('expenses.noExpenses') }}
        </div>
        <div v-else class="space-y-3">
          <div v-for="expense in items" :key="expense.id" class="flex items-center justify-between border-b border-gray-200 py-3">
            <div class="space-y-1">
              <div class="flex items-center gap-3">
                <span class="font-medium text-gray-900">{{ formatCurrency(expense.amount) }}</span>
                <BaseBadge :color="statusColor(expense.status)">
                  {{ t(`expenses.status.${expense.status}`) }}
                </BaseBadge>
              </div>
              <p class="text-sm text-gray-600">{{ t(`expenses.categories.${expense.category}`) }} • {{ formatDate(expense.expenseDate) }}</p>
              <p v-if="expense.description" class="text-xs text-gray-500">{{ expense.description }}</p>
            </div>
            <div class="flex items-center gap-2">
              <BaseButton v-if="expense.status === 'draft'" size="sm" @click="approveExpense(expense.id)" :loading="loading">
                {{ t('expenses.approve') }}
              </BaseButton>
              <BaseButton v-if="expense.status === 'draft'" size="sm" color="red" @click="rejectExpense(expense.id)" :loading="loading">
                {{ t('expenses.reject') }}
              </BaseButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Create Expense Modal -->
      <UModal v-model="isCreateModalOpen">
        <div class="rounded-xl border border-border bg-white p-6 space-y-4">
          <h3 class="text-lg font-semibold text-gray-900">{{ t('expenses.create') }}</h3>

          <div class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-700">{{ t('expenses.category') }}</label>
              <select v-model="createForm.category" class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2">
                <option value="salaries">{{ t('expenses.categories.salaries') }}</option>
                <option value="rent">{{ t('expenses.categories.rent') }}</option>
                <option value="utilities">{{ t('expenses.categories.utilities') }}</option>
                <option value="supplies">{{ t('expenses.categories.supplies') }}</option>
                <option value="maintenance">{{ t('expenses.categories.maintenance') }}</option>
                <option value="food">{{ t('expenses.categories.food') }}</option>
                <option value="transportation">{{ t('expenses.categories.transportation') }}</option>
                <option value="pool">{{ t('expenses.categories.pool') }}</option>
                <option value="other">{{ t('expenses.categories.other') }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">{{ t('expenses.amount') }}</label>
              <input v-model.number="createForm.amount" type="number" step="0.01" class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">{{ t('expenses.expenseDate') }}</label>
              <input v-model="createForm.expenseDate" type="date" class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">{{ t('expenses.description') }}</label>
              <textarea v-model="createForm.description" rows="3" class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" />
            </div>
          </div>

          <div class="flex gap-2 justify-end">
            <BaseButton color="gray" @click="isCreateModalOpen = false">{{ t('common.cancel') }}</BaseButton>
            <BaseButton :loading="loading" @click="submitCreate">{{ t('common.create') }}</BaseButton>
          </div>
        </div>
      </UModal>

      <!-- Reject Expense Modal -->
      <UModal v-model="isRejectModalOpen">
        <div class="rounded-xl border border-border bg-white p-6 space-y-4">
          <h3 class="text-lg font-semibold text-gray-900">{{ t('expenses.rejectTitle') }}</h3>

          <div>
            <label class="block text-sm font-medium text-gray-700">{{ t('expenses.rejectionReason') }}</label>
            <textarea
              v-model="rejectionReason"
              rows="3"
              maxlength="500"
              class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            ></textarea>
            <p class="mt-1 text-xs text-slate-400">{{ t('expenses.rejectionReasonHint') }}</p>
          </div>

          <div class="flex gap-2 justify-end">
            <BaseButton color="gray" @click="rejectingExpenseId = null">{{ t('common.cancel') }}</BaseButton>
            <BaseButton
              color="red"
              :loading="loading"
              :disabled="!rejectionReason.trim()"
              @click="submitRejection"
            >
              {{ t('expenses.reject') }}
            </BaseButton>
          </div>
        </div>
      </UModal>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { expenseRejectionSchema } from '~/shared/schemas/expense.schema'
import type { ExpenseCategory } from '../types/expenses.types'
import { useExpenses } from '../composables/useExpenses'
import { useTenantStore } from '@shared/session/tenant.store'

const { t } = useI18n()
const tenantStore = useTenantStore()
const { items, summary, loading, draftCount, fetchAll, fetchSummary, create, approve, reject } = useExpenses()

const isCreateModalOpen = ref(false)
const rejectingExpenseId = ref<string | null>(null)
const rejectionReason = ref('')
const isRejectModalOpen = computed({
  get: () => rejectingExpenseId.value !== null,
  set: (open: boolean) => { if (!open) rejectingExpenseId.value = null },
})
function emptyExpenseForm() {
  return {
    category: 'other' as ExpenseCategory,
    amount: 0,
    expenseDate: new Date().toISOString().split('T')[0] as string,
    description: '',
  }
}

const createForm = ref(emptyExpenseForm())

const selectedKgId = computed(() => tenantStore.selectedKindergartenId)

useLazyAsyncData('expenses', async () => {
  if (!selectedKgId.value) return true
  await fetchAll(selectedKgId.value)
  await fetchSummary(selectedKgId.value)
  return true
}, { watch: [selectedKgId] })

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(amount)
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('ro-RO')
}

function statusColor(status: string): string {
  switch (status) {
    case 'draft': return 'gray'
    case 'approved': return 'green'
    case 'rejected': return 'red'
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
    createForm.value = emptyExpenseForm()
  }
}

async function approveExpense(id: string) {
  await approve(id)
}

function rejectExpense(id: string) {
  rejectionReason.value = ''
  rejectingExpenseId.value = id
}

async function submitRejection() {
  const id = rejectingExpenseId.value
  const parsed = expenseRejectionSchema.safeParse({ rejectionReason: rejectionReason.value })
  if (!id || !parsed.success) return

  const success = await reject(id, parsed.data.rejectionReason)
  if (success) {
    rejectingExpenseId.value = null
    rejectionReason.value = ''
    if (selectedKgId.value) await fetchSummary(selectedKgId.value)
  }
}
</script>
