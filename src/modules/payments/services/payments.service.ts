import type { SupabaseClient } from '@supabase/supabase-js'
import { appErrorFromPostgrest, appErrorFromValidation } from '@core/errors/app-error'
import type { Database, Tables } from '@core/supabase/types'
import { paymentSchema } from '@shared/schemas/payment.schema'
import type { Payment, PaymentsService } from '../types/payments.types'

function toPayment(row: Tables<'payments'>): Payment {
  return {
    id: row.id,
    kindergartenId: row.kindergarten_id,
    invoiceId: row.invoice_id,
    amount: Number(row.amount),
    paidDate: row.paid_date,
    method: row.method,
    referenceNumber: row.reference_number,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  }
}

export function createPaymentsService(client: SupabaseClient<Database>): PaymentsService {
  return {
    async listPayments(kindergartenId) {
      const response = await client
        .from('payments')
        .select('*')
        .eq('kindergarten_id', kindergartenId)
        .is('deleted_at', null)
        .order('paid_date', { ascending: false })

      if (response.error) return { success: false, error: appErrorFromPostgrest(response) }
      return { success: true, data: response.data.map(toPayment) }
    },

    async recordPayment(input, actorId) {
      const parsed = paymentSchema.safeParse(input)
      if (!parsed.success) return { success: false, error: appErrorFromValidation(parsed.error) }
      const payment = parsed.data

      const response = await client
        .from('payments')
        .insert({
          kindergarten_id: payment.kindergartenId,
          invoice_id: payment.invoiceId,
          amount: payment.amount,
          paid_date: payment.paidDate,
          method: payment.method,
          reference_number: payment.referenceNumber ?? null,
          notes: payment.notes ?? null,
          created_by: actorId,
          updated_by: actorId,
        })
        .select()
        .single()

      if (response.error) return { success: false, error: appErrorFromPostgrest(response) }
      return { success: true, data: toPayment(response.data) }
    },

    async confirmPayment({ paymentId, kindergartenId, actorId }) {
      const response = await client
        .from('payments')
        .update({ status: 'confirmed', updated_by: actorId })
        .eq('id', paymentId)
        .eq('kindergarten_id', kindergartenId)
        .eq('status', 'pending')
        .is('deleted_at', null)
        .select()
        .maybeSingle()

      if (response.error) return { success: false, error: appErrorFromPostgrest(response) }
      // No row: the payment was confirmed concurrently, has failed, or RLS hides it.
      if (!response.data) return { success: false, error: { kind: 'refused', reason: 'payment_not_pending' } }
      return { success: true, data: toPayment(response.data) }
    },

    async getTotalPaidForInvoice(invoiceId) {
      const response = await client.rpc('invoice_total_paid', { p_invoice_id: invoiceId })

      if (response.error) return { success: false, error: appErrorFromPostgrest(response) }
      return { success: true, data: Number(response.data) }
    },
  }
}
