import type { AppError } from '@core/errors/app-error'
import type { ExpenseInput, expenseCategories, expenseStatuses } from '@shared/schemas/expense.schema'
import type { Result } from '@shared/types/result'

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
  byCategory: Partial<Record<ExpenseCategory, number>>
  draftCount: number
}

export interface ExpenseDecision {
  expenseId: string
  kindergartenId: string
  actorId: string
}

export interface ExpenseRejection extends ExpenseDecision {
  reason: string
}

export interface ExpensesService {
  listExpenses(kindergartenId: string): Promise<Result<Expense[], AppError>>
  getSummary(kindergartenId: string): Promise<Result<ExpenseSummary, AppError>>
  recordExpense(input: ExpenseInput, actorId: string): Promise<Result<Expense, AppError>>
  approveExpense(decision: ExpenseDecision): Promise<Result<Expense, AppError>>
  rejectExpense(rejection: ExpenseRejection): Promise<Result<Expense, AppError>>
}

export interface ExpensesDependencies {
  expensesService: ExpensesService
  readCurrentActorId: () => string | null
}
