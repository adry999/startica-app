import type { PostgrestError } from '@supabase/supabase-js'
import type { ZodError } from 'zod'

export interface ValidationIssue {
  field: string
  message: string
}

export type AppError =
  | { kind: 'network' }
  | { kind: 'refused'; reason: string }
  | { kind: 'validation'; issues: ValidationIssue[] }

// Only codes the UI words differently; every other database refusal is generic.
const refusalReasonByPostgrestCode: Record<string, string> = {
  '42501': 'forbidden',
  'PGRST116': 'not_found',
  'PGRST301': 'session_expired',
  '23505': 'conflict',
}

export const sessionExpiredError: AppError = { kind: 'refused', reason: 'session_expired' }

export function appErrorFromPostgrest(response: { error: PostgrestError, status: number }): AppError {
  // postgrest-js reports a fetch that never reached the server as status 0.
  if (response.status === 0) return { kind: 'network' }
  return { kind: 'refused', reason: refusalReasonByPostgrestCode[response.error.code] ?? 'rejected' }
}

export function appErrorFromValidation(error: ZodError): AppError {
  return {
    kind: 'validation',
    issues: error.issues.map(issue => ({ field: issue.path.map(String).join('.'), message: issue.message })),
  }
}

export function appErrorMessageKey(error: AppError): string {
  if (error.kind === 'refused') return `errors.refused.${error.reason}`
  return `errors.${error.kind}`
}
