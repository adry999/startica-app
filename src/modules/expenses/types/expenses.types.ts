import type { expenseCategories, expenseStatuses } from '~/shared/schemas/expense.schema'

// Derived from the Zod schema so the two cannot drift apart.
export type ExpenseCategory = (typeof expenseCategories)[number]
export type ExpenseStatus = (typeof expenseStatuses)[number]

export interface Expense {
  id: string
  kindergartenId: string
  category: ExpenseCategory
  amount: number
  expenseDate: string
  description: string | null
  status: ExpenseStatus
  approvedBy: string | null
  rejectionReason: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export interface ExpenseSummary {
  totalSpent: number
  totalApproved: number
  totalPending: number
  byCategory: Record<ExpenseCategory, number>
}
