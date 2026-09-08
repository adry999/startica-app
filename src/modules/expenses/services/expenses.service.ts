/* @ts-ignore — Expenses module. */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
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
  input: {
    kindergartenId: string
    category: ExpenseCategory
    amount: number
    expenseDate: string
    description?: string | null
  },
  userId: string,
): Promise<Result<Expense>> {
  const { data, error } = await client
    .from('expenses')
    .insert({
      kindergarten_id: input.kindergartenId,
      category: input.category,
      amount: input.amount,
      expense_date: input.expenseDate,
      description: input.description ?? null,
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
  const { data, error } = await client
    .from('expenses')
    .select('amount, status, category')
    .eq('kindergarten_id', kindergartenId)
    .is('deleted_at', null)

  if (error) return { success: false, error: error.message }

  const expenses = data ?? []
  const byCategory: Record<string, number> = {}
  let totalSpent = 0
  let totalApproved = 0
  let totalPending = 0

  for (const exp of expenses) {
    const amount = Number(exp.amount)
    byCategory[exp.category as string] = (byCategory[exp.category as string] ?? 0) + amount

    if (exp.status === 'approved') {
      totalApproved += amount
    }
    if (exp.status === 'draft') {
      totalPending += amount
    }
  }

  totalSpent = totalApproved + totalPending

  return { success: true, data: { totalSpent, totalApproved, totalPending, byCategory } }
}
