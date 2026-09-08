import { z } from 'zod'

export const paymentMethods = ['bank_transfer', 'cash', 'check', 'online'] as const
export const paymentStatuses = ['pending', 'confirmed', 'failed'] as const

export const paymentSchema = z.object({
  kindergartenId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  // coerce: UInput type="number" emits string values (same as groups.schema).
  // numeric(12,2) in Postgres — reject more than 2 decimal places rather than
  // letting the DB silently round a payment amount.
  amount: z.coerce
    .number()
    .positive()
    .max(9_999_999_999.99)
    .refine(n => Number.isInteger(Math.round(n * 100)) && Math.round(n * 100) / 100 === n, {
      message: 'amount supports at most 2 decimal places',
    }),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(paymentMethods),
  referenceNumber: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
})

export type PaymentMethod = (typeof paymentMethods)[number]
export type PaymentStatus = (typeof paymentStatuses)[number]
export type PaymentInput = z.infer<typeof paymentSchema>
