export type ExpenseCategory = 'salaries' | 'rent' | 'utilities' | 'supplies' | 'maintenance' | 'food' | 'transportation' | 'other'
export type ExpenseStatus = 'draft' | 'approved' | 'rejected'

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
