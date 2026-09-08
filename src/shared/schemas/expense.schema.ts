import { z } from 'zod'

export const expenseCategories = [
  'salaries',
  'rent',
  'utilities',
  'supplies',
  'maintenance',
  'food',
  'transportation',
  'other',
] as const

export const expenseStatuses = ['draft', 'approved', 'rejected'] as const

export const expenseSchema = z.object({
  kindergartenId: z.string().uuid(),
  category: z.enum(expenseCategories),
  // coerce: UInput type="number" emits string values (same as groups.schema).
  // numeric(12,2) in Postgres — reject more than 2 decimal places rather than
  // letting the DB silently round an expense amount.
  amount: z.coerce
    .number()
    .positive()
    .max(9_999_999_999.99)
    .refine(n => Math.round(n * 100) / 100 === n, {
      message: 'amount supports at most 2 decimal places',
    }),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().max(1000).nullable().optional(),
})

export const expenseRejectionSchema = z.object({
  rejectionReason: z.string().trim().min(1).max(500),
})

export type ExpenseInput = z.infer<typeof expenseSchema>
export type ExpenseRejectionInput = z.infer<typeof expenseRejectionSchema>
