export type ErrorSource = 'app' | 'vue'

export interface ErrorReport {
  source: ErrorSource
  detail?: string
}

// Single sink for unexpected errors: an external reporter replaces this body, not the call sites.
// Callers pass no user data in `detail`; route queries can hold children's names.
export function reportError(error: unknown, report: ErrorReport): void {
  console.error(`[startica:${report.source}]`, report.detail ?? '', error)
}
