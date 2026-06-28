// V1 email delivery is handled entirely by Supabase Auth (invite + password reset)
// routed through Brevo custom SMTP — configured in the Supabase dashboard, not here.
//
// This module is the future home for app-triggered emails (custom notifications,
// per-kindergarten sender branding, vue-email templates rendered to HTML).
// Swap path: change only this file and core/email/; call sites stay untouched.
//
// To activate: implement sendEmail() against the Brevo SDK, add vue-email templates
// to core/email/templates/, and configure BREVO_API_KEY in runtimeConfig.

export type EmailLocale = 'ro' | 'en'

export interface SendEmailOptions {
  template: string
  to: string
  locale: EmailLocale
  data?: Record<string, unknown>
}

// Server-side only — never call from the client.
export async function sendEmail(_opts: SendEmailOptions): Promise<void> {
  throw new Error('sendEmail is not implemented in V1 — app emails are deferred to V2.')
}
