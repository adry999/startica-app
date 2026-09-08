/* @ts-ignore — Payments module. */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Payment } from '../types/payments.types'
import * as service from '../services/payments.service'
import { useSupabaseClient } from '~/core/supabase/client'

export const usePaymentsStore = defineStore('payments', () => {
  const client = useSupabaseClient()
  const items = ref<Payment[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchByInvoice(kindergartenId: string, invoiceId: string) {
    loading.value = true
    error.value = null
    try {
      const result = await service.listPayments(client, kindergartenId, invoiceId)
      if (result.success) {
        items.value = result.data
        return true
      }
      error.value = result.error
      return false
    } finally {
      loading.value = false
    }
  }

  async function create(input: { kindergartenId: string; invoiceId: string; amount: number; paidDate: string; method: string; referenceNumber?: string | null; notes?: string | null }, userId: string) {
    loading.value = true
    error.value = null
    try {
      const result = await service.createPayment(client, input, userId)
      if (result.success) {
        items.value.push(result.data)
        return true
      }
      error.value = result.error
      return false
    } finally {
      loading.value = false
    }
  }

  async function confirm(id: string, userId: string) {
    loading.value = true
    error.value = null
    try {
      const result = await service.confirmPayment(client, id, userId)
      if (result.success) {
        const idx = items.value.findIndex(p => p.id === id)
        if (idx >= 0) items.value[idx] = result.data
        return true
      }
      error.value = result.error
      return false
    } finally {
      loading.value = false
    }
  }

  const totalConfirmed = computed(() =>
    items.value.filter(p => p.status === 'confirmed').reduce((sum, p) => sum + p.amount, 0)
  )

  return { items, loading, error, totalConfirmed, fetchByInvoice, create, confirm }
})
