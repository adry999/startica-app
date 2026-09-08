export type PaymentStatus = 'pending' | 'confirmed' | 'failed'

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
