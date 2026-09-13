import type { AppError } from '@core/errors/app-error'
import type { Database } from '@core/supabase/types'
import type { PaymentInput } from '@shared/schemas/payment.schema'
import type { Result } from '@shared/types/result'

export type PaymentStatus = Database['public']['Enums']['payment_status']

export interface Payment {
  id: string
  kindergartenId: string
  invoiceId: string
  amount: number
  paidDate: string
  method: string
  referenceNumber: string | null
  status: PaymentStatus
  notes: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

// Billing owns invoices; payments only needs enough to pick the invoice a payment settles.
export interface PayableInvoice {
  id: string
  childName: string
  amount: number
  dueDate: string
}

export type ListPayableInvoices = (kindergartenId: string) => Promise<Result<PayableInvoice[], AppError>>

export interface ConfirmPaymentCommand {
  paymentId: string
  kindergartenId: string
  actorId: string
}

export interface PaymentsService {
  listPayments(kindergartenId: string): Promise<Result<Payment[], AppError>>
  recordPayment(input: PaymentInput, actorId: string): Promise<Result<Payment, AppError>>
  confirmPayment(command: ConfirmPaymentCommand): Promise<Result<Payment, AppError>>
  getTotalPaidForInvoice(invoiceId: string): Promise<Result<number, AppError>>
}

export interface PaymentsDependencies {
  paymentsService: PaymentsService
  listPayableInvoices: ListPayableInvoices
  readCurrentActorId: () => string | null
}
