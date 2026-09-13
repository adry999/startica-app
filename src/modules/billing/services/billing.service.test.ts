import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import { getSummary } from './billing.service'
import { getTotalPaidForInvoice } from '~/modules/payments/services/payments.service'

describe('financial aggregates', () => {
  it('uses a tenant-scoped database aggregate rather than a capped invoice list', async () => {
    const rpc = vi.fn().mockReturnValue({ single: async () => ({ data: {
      total_issued: '10010.25', total_paid: '250.50', total_overdue: '10.25', pending_count: '1001',
    }, error: null }) })
    const client = { rpc } as unknown as SupabaseClient<Database>
    expect(await getSummary(client, 'kg-a')).toEqual({ success: true, data: {
      totalIssued: 10010.25, totalPaid: 250.5, totalOverdue: 10.25, pendingCount: 1001,
    } })
    expect(rpc).toHaveBeenCalledWith('invoice_summary', { p_kindergarten_id: 'kg-a' })
  })

  it('surfaces aggregate failures instead of showing zero balances', async () => {
    const rpc = vi.fn().mockReturnValue({ single: async () => ({ data: null, error: { message: 'denied' } }) })
    expect(await getSummary({ rpc } as unknown as SupabaseClient<Database>, 'kg-a'))
      .toEqual({ success: false, error: 'denied' })
  })

  it('aggregates confirmed payments in the database and accepts an empty total', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 0, error: null })
    expect(await getTotalPaidForInvoice({ rpc } as unknown as SupabaseClient<Database>, 'invoice-a'))
      .toEqual({ success: true, data: 0 })
    expect(rpc).toHaveBeenCalledWith('invoice_total_paid', { p_invoice_id: 'invoice-a' })
  })
})
