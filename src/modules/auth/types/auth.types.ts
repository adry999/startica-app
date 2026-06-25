import type { Database } from '~/core/supabase/types'

export type UserRole = Database['public']['Enums']['user_role']
export type UserStatus = Database['public']['Enums']['user_status']

export interface AuthUser {
  id: string
  email: string
  fullName: string
  role: UserRole
  avatarUrl: string | null
  status: UserStatus
}

export interface LoginCredentials {
  email: string
  password: string
}
