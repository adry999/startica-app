import type { Database } from '~/core/supabase/types'

type UserRole = Database['public']['Enums']['user_role']

declare module '#app' {
  interface PageMeta {
    /** Page is reachable without an authenticated session. */
    public?: boolean
    /** Authenticated users are redirected away from this page (e.g. /login). */
    guestOnly?: boolean
    /** If set, only these roles may view the page (role.ts middleware). */
    roles?: UserRole[]
  }
}

export {}
