import type { Database } from '~/core/supabase/types'

export type KindergartenStatus = Database['public']['Enums']['kindergarten_status']

export interface KindergartenSettings {
  timezone: string
  defaultLocale: 'ro' | 'en'
  workingHours: { start: string; end: string }
}

export interface Kindergarten {
  id: string
  name: string
  address: string | null
  city: string | null
  phone: string | null
  status: KindergartenStatus
  settings: KindergartenSettings
  createdAt: string
}
