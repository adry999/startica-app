import { describe, expect, it } from 'vitest'
import type { PostgrestError } from '@supabase/supabase-js'
import { z } from 'zod'
import { appErrorFromPostgrest, appErrorFromValidation, appErrorMessageKey } from './app-error'

function postgrestError(code: string): PostgrestError {
  return { code, message: `database error ${code}`, details: '', hint: '' } as PostgrestError
}

describe('appErrorFromPostgrest', () => {
  it('treats a request that never reached the server as a network failure', () => {
    expect(appErrorFromPostgrest({ error: postgrestError(''), status: 0 })).toEqual({ kind: 'network' })
  })

  it('reports a row-level security denial as forbidden', () => {
    expect(appErrorFromPostgrest({ error: postgrestError('42501'), status: 403 }))
      .toEqual({ kind: 'refused', reason: 'forbidden' })
  })

  it('does not leak unmapped database codes to the caller', () => {
    expect(appErrorFromPostgrest({ error: postgrestError('23514'), status: 400 }))
      .toEqual({ kind: 'refused', reason: 'rejected' })
  })
})

describe('appErrorFromValidation', () => {
  it('keeps the failing field path so a form can highlight it', () => {
    const parsed = z.object({ payment: z.object({ amount: z.number().positive() }) })
      .safeParse({ payment: { amount: -1 } })
    if (parsed.success) throw new Error('expected validation to fail')

    const appError = appErrorFromValidation(parsed.error)
    expect(appError.kind).toBe('validation')
    expect(appError.kind === 'validation' && appError.issues[0]?.field).toBe('payment.amount')
  })
})

describe('appErrorMessageKey', () => {
  it('namespaces refusals by reason', () => {
    expect(appErrorMessageKey({ kind: 'refused', reason: 'payment_not_pending' }))
      .toBe('errors.refused.payment_not_pending')
  })

  it('uses the error kind for network and validation failures', () => {
    expect(appErrorMessageKey({ kind: 'network' })).toBe('errors.network')
    expect(appErrorMessageKey({ kind: 'validation', issues: [] })).toBe('errors.validation')
  })
})
