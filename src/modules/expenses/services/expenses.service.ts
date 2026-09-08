import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import { expenseSchema, type ExpenseInput } from '~/shared/schemas/expense.schema'
import type { Expense, ExpenseCategory, ExpenseStatus, ExpenseSummary } from '../types/expenses.types'

type Client = SupabaseClient<Database>

function toExpense(row: Record<string, unknown>): Expense {
  return {
    id: row.id as string,
    kindergartenId: row.kindergarten_id as string,
    category: row.category as ExpenseCategory,
    amount: Number(row.amount),
    expenseDate: row.expense_date as string,
    description: (row.description as string | null) ?? null,
    status: row.status as ExpenseStatus,
    approvedBy: (row.approved_by as string | null) ?? null,
    rejectionReason: (row.rejection_reason as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    createdBy: (row.created_by as string | null) ?? null,
    updatedBy: (row.updated_by as string | null) ?? null,
  }
}

export async function listExpenses(
  client: Client,
  kindergartenId: string,
  status?: ExpenseStatus,
): Promise<Result<Expense[]>> {
  let q = client
    .from('expenses')
    .select('*')
    .eq('kindergarten_id', kindergartenId)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false })

  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toExpense(r as Record<string, unknown>)) }
}

export async function createExpense(
  client: Client,
  input: ExpenseInput,
  userId: string,
): Promise<Result<Expense>> {
  const parsed = expenseSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'validation_failed' }
  }
  const v = parsed.data

  const { data, error } = await client
    .from('expenses')
    .insert({
      kindergarten_id: v.kindergartenId,
      category: v.category,
      amount: v.amount,
      expense_date: v.expenseDate,
      description: v.description ?? null,
      created_by: userId,
      updated_by: userId,
    })
    .select()
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data: toExpense(data as Record<string, unknown>) }
}

export async function approveExpense(
  client: Client,
  id: string,
  userId: string,
): Promise<Result<Expense>> {
  const { data, error } = await client
    .from('expenses')
    .update({ status: 'approved', approved_by: userId, updated_by: userId })
    .eq('id', id)
    .select()
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data: toExpense(data as Record<string, unknown>) }
}

export async function rejectExpense(
  client: Client,
  id: string,
  reason: string,
  userId: string,
): Promise<Result<Expense>> {
  const { data, error } = await client
    .from('expenses')
    .update({ status: 'rejected', rejection_reason: reason, updated_by: userId })
    .eq('id', id)
    .select()
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data: toExpense(data as Record<string, unknown>) }
}

export async function getSummary(
  client: Client,
  kindergartenId: string,
): Promise<Result<ExpenseSummary>> {
  // Aggregated in Postgres: selecting every row and summing in JS silently
  // under-reported once a kindergarten passed PostgREST's 1000-row response cap.
  const { data, error } = await client
    .rpc('expense_summary', { p_kindergarten_id: kindergartenId })
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'summary_failed' }

  const row = data as {
    total_spent: number | string
    total_approved: number | string
    total_pending: number | string
    by_category: Record<string, number | string> | null
  }

  const byCategory: Record<string, number> = {}
  for (const [k, v] of Object.entries(row.by_category ?? {})) byCategory[k] = Number(v)

  return {
    success: true,
    data: {
      totalSpent: Number(row.total_spent),
      totalApproved: Number(row.total_approved),
      totalPending: Number(row.total_pending),
      byCategory: byCategory as ExpenseSummary['byCategory'],
    },
  }
}
