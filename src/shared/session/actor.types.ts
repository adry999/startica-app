import type { Database } from '@core/supabase/types'

export type UserRole = Database['public']['Enums']['user_role']
export type UserStatus = Database['public']['Enums']['user_status']

export type ModuleKey = 'pool' | 'payroll_own' | 'payroll_all'

export interface ModuleGrant {
  kindergartenId: string
  moduleKey: ModuleKey
}

export interface Actor {
  id: string
  email: string
  fullName: string
  role: UserRole
  avatarUrl: string | null
  status: UserStatus
}

export type ActorProfileChange = Partial<Pick<Actor, 'fullName' | 'avatarUrl'>>
