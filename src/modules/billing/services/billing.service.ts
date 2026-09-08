import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { Invoice, InvoiceStatus, InvoiceSummary } from '../types/billing.types'

type Client = SupabaseClient<Database>

function toInvoice(row: Record<string, unknown>): Invoice {
  return {
    id: row.id as string,
    kindergartenId: row.kindergarten_id as string,
    childId: row.child_id as string,
    childName: ((row.children as { first_name: string; last_name: string } | null)?.first_name ?? '') + ' ' + ((row.children as { first_name: string; last_name: string } | null)?.last_name ?? ''),
    amount: Number(row.amount),
    dueDate: row.due_date as string,
    paidAt: row.paid_at as string | null,
    status: row.status as InvoiceStatus,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    createdBy: (row.created_by as string | null) ?? null,
    updatedBy: (row.updated_by as string | null) ?? null,
  }
}

export async function listInvoices(
  client: Client,
  kindergartenId: string,
  status?: InvoiceStatus,
): Promise<Result<Invoice[]>> {
  let q = client
    .from('invoices')
    .select('*, children(first_name, last_name)')
    .eq('kindergarten_id', kindergartenId)
    .is('deleted_at', null)
    .order('due_date', { ascending: false })

  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toInvoice(r as Record<string, unknown>)) }
}

export async function getInvoice(
  client: Client,
  id: string,
): Promise<Result<Invoice>> {
  const { data, error } = await client
    .from('invoices')
    .select('*, children(first_name, last_name)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'not_found' }
  return { success: true, data: toInvoice(data as Record<string, unknown>) }
}

export async function createInvoice(
  client: Client,
  input: {
    kindergartenId: string
    childId: string
    amount: number
    dueDate: string
    notes?: string | null
  },
  userId: string,
): Promise<Result<Invoice>> {
  const { data, error } = await client
    .from('invoices')
    .insert({
      kindergarten_id: input.kindergartenId,
      child_id: input.childId,
      amount: input.amount,
      due_date: input.dueDate,
      notes: input.notes ?? null,
      created_by: userId,
      updated_by: userId,
    })
    .select('*, children(first_name, last_name)')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data: toInvoice(data as Record<string, unknown>) }
}

export async function updateInvoice(
  client: Client,
  id: string,
  input: {
    amount?: number
    dueDate?: string
    status?: InvoiceStatus
    paidAt?: string | null
    notes?: string | null
  },
  userId: string,
): Promise<Result<Invoice>> {
  const payload: any = {
    updated_by: userId,
  }
  if (input.amount !== undefined) payload.amount = input.amount
  if (input.dueDate !== undefined) payload.due_date = input.dueDate
  if (input.status !== undefined) payload.status = input.status
  if (input.paidAt !== undefined) payload.paid_at = input.paidAt
  if (input.notes !== undefined) payload.notes = input.notes

  const { data, error } = await client
    .from('invoices')
    .update(payload)
    .eq('id', id)
    .select('*, children(first_name, last_name)')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data: toInvoice(data as Record<string, unknown>) }
}

export async function markAsPaid(
  client: Client,
  id: string,
  userId: string,
): Promise<Result<Invoice>> {
  const now = new Date().toISOString()
  return updateInvoice(client, id, { status: 'paid', paidAt: now }, userId)
}

export async function getSummary(
  client: Client,
  kindergartenId: string,
): Promise<Result<InvoiceSummary>> {
  const { data, error } = await client
    .from('invoices')
    .select('amount, status, due_date')
    .eq('kindergarten_id', kindergartenId)
    .is('deleted_at', null)

  if (error) return { success: false, error: error.message }

  const today = new Date().toISOString().split('T')[0]
  const summary: InvoiceSummary = {
    totalIssued: 0,
    totalPaid: 0,
    totalOverdue: 0,
    pendingCount: 0,
  }

  for (const row of data ?? []) {
    const amount = Number(row.amount)
    const status = row.status as InvoiceStatus
    const dueDate = row.due_date as string

    if (status === 'issued') summary.totalIssued += amount
    if (status === 'paid') summary.totalPaid += amount
    if (status === 'issued' && dueDate < today) summary.totalOverdue += amount
    if (status === 'issued' || status === 'draft') summary.pendingCount += 1
  }

  return { success: true, data: summary }
}
