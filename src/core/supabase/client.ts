import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { parseCookies, setCookie } from 'h3'
import type { H3Event } from 'h3'
import type { Database } from './types'

/**
 * Browser-side Supabase client — use from composables/stores/components.
 * Session is persisted via cookies (shared with SSR) instead of localStorage.
 */
export function createSupabaseBrowserClient() {
  const { public: { supabaseUrl, supabaseAnonKey } } = useRuntimeConfig()

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
}

/**
 * Server-side Supabase client — use from server routes / middleware.
 * Reads/writes the auth cookies on the current H3 event so the session
 * stays in sync between SSR and the browser client.
 */
export function createSupabaseServerClient(event: H3Event) {
  const { public: { supabaseUrl, supabaseAnonKey } } = useRuntimeConfig(event)

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => {
        const cookies = parseCookies(event)
        return Object.entries(cookies).map(([name, value]) => ({ name, value }))
      },
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          setCookie(event, name, value, options)
        }
      },
    },
  })
}

/**
 * Server-side Supabase client using the service role key — bypasses RLS.
 * Only for trusted server flows (e.g. staff invitation) that must act
 * outside the requesting user's own permissions. Never expose to the client.
 */
export function createSupabaseAdminClient() {
  const { public: { supabaseUrl }, supabaseServiceRoleKey } = useRuntimeConfig()

  return createServerClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  })
}
