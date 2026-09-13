import type { SupabaseClient } from '@supabase/supabase-js'
import { appErrorFromPostgrest } from '@core/errors/app-error'
import type { Database, Tables } from '@core/supabase/types'
import type { BillingService, Invoice, InvoiceStatus } from '../types/billing.types'

type ChildName = Pick<Tables<'children'>, 'first_name' | 'last_name'>
type InvoiceWithChild = Tables<'invoices'> & { children: ChildName | null }

const invoiceWithChildColumns = '*, children(first_name, last_name)'
const payableInvoiceColumns = 'id, amount, due_date, children(first_name, last_name)'
const payableStatuses: InvoiceStatus[] = ['issued', 'overdue']

function formatChildName(child: ChildName | null): string {
  return child ? `${child.first_name} ${child.last_name}` : ''
}

function toInvoice(row: InvoiceWithChild): Invoice {
  return {
    id: row.id,
    kindergartenId: row.kindergarten_id,
    childId: row.child_id,
    childName: formatChildName(row.children),
    amount: Number(row.amount),
    dueDate: row.due_date,
    paidAt: row.paid_at,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  }
}

export function createBillingService(client: SupabaseClient<Database>): BillingService {
  return {
    async listInvoices(kindergartenId) {
      const response = await client
        .from('invoices')
        .select(invoiceWithChildColumns)
        .eq('kindergarten_id', kindergartenId)
        .is('deleted_at', null)
        .order('due_date', { ascending: false })

      if (response.error) return { success: false, error: appErrorFromPostgrest(response) }
      return { success: true, data: response.data.map(toInvoice) }
    },

    async getSummary(kindergartenId) {
      const response = await client
        .rpc('invoice_summary', { p_kindergarten_id: kindergartenId })
        .single()

      if (response.error) return { success: false, error: appErrorFromPostgrest(response) }
      return {
        success: true,
        data: {
          totalIssued: Number(response.data.total_issued),
          totalPaid: Number(response.data.total_paid),
          totalOverdue: Number(response.data.total_overdue),
          pendingCount: Number(response.data.pending_count),
        },
      }
    },

    async listPayableInvoices(kindergartenId) {
      const response = await client
        .from('invoices')
        .select(payableInvoiceColumns)
        .eq('kindergarten_id', kindergartenId)
        .in('status', payableStatuses)
        .is('deleted_at', null)
        .order('due_date', { ascending: true })

      if (response.error) return { success: false, error: appErrorFromPostgrest(response) }
      return {
        success: true,
        data: response.data.map(row => ({
          id: row.id,
          childName: formatChildName(row.children),
          amount: Number(row.amount),
          dueDate: row.due_date,
        })),
      }
    },

    async markInvoicePaid({ invoiceId, kindergartenId, actorId }) {
      const response = await client
        .from('invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString(), updated_by: actorId })
        .eq('id', invoiceId)
        .eq('kindergarten_id', kindergartenId)
        .in('status', payableStatuses)
        .is('deleted_at', null)
        .select(invoiceWithChildColumns)
        .maybeSingle()

      if (response.error) return { success: false, error: appErrorFromPostgrest(response) }
      // No row: someone already settled or cancelled the invoice, or RLS hides it.
      if (!response.data) return { success: false, error: { kind: 'refused', reason: 'invoice_not_payable' } }
      return { success: true, data: toInvoice(response.data) }
    },
  }
}
