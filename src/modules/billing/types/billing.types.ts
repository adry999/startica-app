export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled'

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
