/* @ts-ignore — Billing is deferred (Should Have, not V1). */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Invoice, InvoiceStatus, InvoiceSummary } from '../types/billing.types'
import * as service from '../services/billing.service'
import { useSupabaseClient } from '~/core/supabase/client'
import { useStoreAction } from '~/shared/composables/useStoreAction'

export const useBillingStore = defineStore('billing', () => {
  const client = useSupabaseClient()
  const items = ref<Invoice[]>([])
  const summary = ref<InvoiceSummary | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchAll = useStoreAction(
    async (kindergartenId: string, status?: InvoiceStatus) => {
      const result = await service.listInvoices(client, kindergartenId, status)
      if (result.success) items.value = result.data
      return result
    },
    () => { error.value = null },
    (err) => { error.value = err },
  )

  const fetchSummary = useStoreAction(
    async (kindergartenId: string) => {
      const result = await service.getSummary(client, kindergartenId)
      if (result.success) summary.value = result.data
      return result
    },
    () => { error.value = null },
    (err) => { error.value = err },
  )

  const create = useStoreAction(
    async (input: { kindergartenId: string; childId: string; amount: number; dueDate: string; notes?: string | null }, userId: string) => {
      const result = await service.createInvoice(client, input, userId)
      if (result.success) {
        items.value.push(result.data)
        await fetchSummary(input.kindergartenId)
      }
      return result
    },
    () => { error.value = null },
    (err) => { error.value = err },
  )

  const update = useStoreAction(
    async (id: string, input: { amount?: number; dueDate?: string; status?: InvoiceStatus; paidAt?: string | null; notes?: string | null }, userId: string) => {
      const result = await service.updateInvoice(client, id, input, userId)
      if (result.success) {
        const idx = items.value.findIndex(i => i.id === id)
        if (idx >= 0) items.value[idx] = result.data
      }
      return result
    },
    () => { error.value = null },
    (err) => { error.value = err },
  )

  const markAsPaid = useStoreAction(
    async (id: string, userId: string) => {
      const result = await service.markAsPaid(client, id, userId)
      if (result.success) {
        const idx = items.value.findIndex(i => i.id === id)
        if (idx >= 0) items.value[idx] = result.data
      }
      return result
    },
    () => { error.value = null },
    (err) => { error.value = err },
  )

  const pendingCount = computed(() => items.value.filter(i => i.status === 'draft' || i.status === 'issued').length)

  return { items, summary, loading, error, pendingCount, fetchAll, fetchSummary, create, update, markAsPaid }
})
