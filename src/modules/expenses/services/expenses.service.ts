import type { SupabaseClient } from '@supabase/supabase-js'
import { appErrorFromPostgrest, appErrorFromValidation } from '@core/errors/app-error'
import type { Database, Json, Tables } from '@core/supabase/types'
import { expenseCategories, expenseRejectionSchema, expenseSchema } from '@shared/schemas/expense.schema'
import type { Expense, ExpenseSummary, ExpensesService } from '../types/expenses.types'

const expenseNotDraft = { kind: 'refused', reason: 'expense_not_draft' } as const

function toExpense(row: Tables<'expenses'>): Expense {
  return {
    id: row.id,
    kindergartenId: row.kindergarten_id,
    category: row.category,
    amount: Number(row.amount),
    expenseDate: row.expense_date,
    description: row.description,
    status: row.status,
    approvedBy: row.approved_by,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  }
}

function toCategoryTotals(byCategory: Json): ExpenseSummary['byCategory'] {
  const totals: ExpenseSummary['byCategory'] = {}
  if (!byCategory || typeof byCategory !== 'object' || Array.isArray(byCategory)) return totals
  for (const category of expenseCategories) {
    const total = byCategory[category]
    if (total !== undefined && total !== null) totals[category] = Number(total)
  }
  return totals
}

export function createExpensesService(client: SupabaseClient<Database>): ExpensesService {
  return {
    async listExpenses(kindergartenId) {
      const response = await client
        .from('expenses')
        .select('*')
        .eq('kindergarten_id', kindergartenId)
        .is('deleted_at', null)
        .order('expense_date', { ascending: false })

      if (response.error) return { success: false, error: appErrorFromPostgrest(response) }
      return { success: true, data: response.data.map(toExpense) }
    },

    // Aggregated in Postgres: summing the list in the browser under-reports past PostgREST's 1000-row cap.
    async getSummary(kindergartenId) {
      const response = await client
        .rpc('expense_summary', { p_kindergarten_id: kindergartenId })
        .single()

      if (response.error) return { success: false, error: appErrorFromPostgrest(response) }
      return {
        success: true,
        data: {
          totalSpent: Number(response.data.total_spent),
          totalApproved: Number(response.data.total_approved),
          totalPending: Number(response.data.total_pending),
          byCategory: toCategoryTotals(response.data.by_category),
        },
      }
    },

    async recordExpense(input, actorId) {
      const parsed = expenseSchema.safeParse(input)
      if (!parsed.success) return { success: false, error: appErrorFromValidation(parsed.error) }
      const expense = parsed.data

      const response = await client
        .from('expenses')
        .insert({
          kindergarten_id: expense.kindergartenId,
          category: expense.category,
          amount: expense.amount,
          expense_date: expense.expenseDate,
          description: expense.description || null,
          created_by: actorId,
          updated_by: actorId,
        })
        .select()
        .single()

      if (response.error) return { success: false, error: appErrorFromPostgrest(response) }
      return { success: true, data: toExpense(response.data) }
    },

    async approveExpense({ expenseId, kindergartenId, actorId }) {
      const response = await client
        .from('expenses')
        .update({ status: 'approved', approved_by: actorId, updated_by: actorId })
        .eq('id', expenseId)
        .eq('kindergarten_id', kindergartenId)
        .eq('status', 'draft')
        .is('deleted_at', null)
        .select()
        .maybeSingle()

      if (response.error) return { success: false, error: appErrorFromPostgrest(response) }
      // No row: someone already approved or rejected it, or RLS hides it.
      if (!response.data) return { success: false, error: expenseNotDraft }
      return { success: true, data: toExpense(response.data) }
    },

    async rejectExpense({ expenseId, kindergartenId, actorId, reason }) {
      const parsed = expenseRejectionSchema.safeParse({ rejectionReason: reason })
      if (!parsed.success) return { success: false, error: appErrorFromValidation(parsed.error) }

      const response = await client
        .from('expenses')
        .update({ status: 'rejected', rejection_reason: parsed.data.rejectionReason, updated_by: actorId })
        .eq('id', expenseId)
        .eq('kindergarten_id', kindergartenId)
        .eq('status', 'draft')
        .is('deleted_at', null)
        .select()
        .maybeSingle()

      if (response.error) return { success: false, error: appErrorFromPostgrest(response) }
      if (!response.data) return { success: false, error: expenseNotDraft }
      return { success: true, data: toExpense(response.data) }
    },
  }
}
