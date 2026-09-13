import type { AppError } from '@core/errors/app-error'
import type { Database } from '@core/supabase/types'
import type { Result } from '@shared/types/result'

export type InvoiceStatus = Database['public']['Enums']['invoice_status']

export interface Invoice {
  id: string
  kindergartenId: string
  childId: string
  childName: string
  amount: number
  dueDate: string
  paidAt: string | null
  status: InvoiceStatus
  notes: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export interface InvoiceSummary {
  totalIssued: number
  totalPaid: number
  totalOverdue: number
  pendingCount: number
}

export interface PayableInvoice {
  id: string
  childName: string
  amount: number
  dueDate: string
}

export interface MarkInvoicePaidCommand {
  invoiceId: string
  kindergartenId: string
  actorId: string
}

export interface BillingService {
  listInvoices(kindergartenId: string): Promise<Result<Invoice[], AppError>>
  getSummary(kindergartenId: string): Promise<Result<InvoiceSummary, AppError>>
  listPayableInvoices(kindergartenId: string): Promise<Result<PayableInvoice[], AppError>>
  markInvoicePaid(command: MarkInvoicePaidCommand): Promise<Result<Invoice, AppError>>
}

export interface BillingDependencies {
  billingService: BillingService
  readCurrentActorId: () => string | null
}
