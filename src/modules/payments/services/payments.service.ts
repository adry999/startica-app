import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import { paymentSchema, type PaymentInput } from '~/shared/schemas/payment.schema'
import type { Payment, PaymentStatus } from '../types/payments.types'

type Client = SupabaseClient<Database>

function toPayment(row: Record<string, unknown>): Payment {
  return {
    id: row.id as string,
    kindergartenId: row.kindergarten_id as string,
    invoiceId: row.invoice_id as string,
    amount: Number(row.amount),
    paidDate: row.paid_date as string,
    method: row.method as string,
    referenceNumber: (row.reference_number as string | null) ?? null,
    status: row.status as PaymentStatus,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    createdBy: (row.created_by as string | null) ?? null,
    updatedBy: (row.updated_by as string | null) ?? null,
  }
}

export async function listPayments(
  client: Client,
  kindergartenId: string,
  invoiceId?: string,
): Promise<Result<Payment[]>> {
  let q = client
    .from('payments')
    .select('*')
    .eq('kindergarten_id', kindergartenId)
    .is('deleted_at', null)
    .order('paid_date', { ascending: false })

  if (invoiceId) q = q.eq('invoice_id', invoiceId)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toPayment(r as Record<string, unknown>)) }
}

export async function createPayment(
  client: Client,
  input: PaymentInput,
  userId: string,
): Promise<Result<Payment>> {
  const parsed = paymentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'validation_failed' }
  }
  const v = parsed.data

  const { data, error } = await client
    .from('payments')
    .insert({
      kindergarten_id: v.kindergartenId,
      invoice_id: v.invoiceId,
      amount: v.amount,
      paid_date: v.paidDate,
      method: v.method,
      reference_number: v.referenceNumber ?? null,
      notes: v.notes ?? null,
      created_by: userId,
      updated_by: userId,
    })
    .select()
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data: toPayment(data as Record<string, unknown>) }
}

export async function confirmPayment(
  client: Client,
  id: string,
  userId: string,
): Promise<Result<Payment>> {
  const { data, error } = await client
    .from('payments')
    .update({ status: 'confirmed', updated_by: userId })
    .eq('id', id)
    .select()
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data: toPayment(data as Record<string, unknown>) }
}

export async function getTotalPaidForInvoice(
  client: Client,
  invoiceId: string,
): Promise<Result<number>> {
  const { data, error } = await client
    .from('payments')
    .select('amount')
    .eq('invoice_id', invoiceId)
    .eq('status', 'confirmed')
    .is('deleted_at', null)

  if (error) return { success: false, error: error.message }
  const total = (data ?? []).reduce((sum, row) => sum + Number(row.amount), 0)
  return { success: true, data: total }
}
