import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'

type Client = SupabaseClient<Database>
export type KindergartenRow = Database['public']['Tables']['kindergartens']['Row']
type KindergartenStatus = Database['public']['Enums']['kindergarten_status']

interface DetailsInput {
  name: string
  address?: string
  city?: string
  phone?: string
}

interface SettingsInput {
  timezone: string
  defaultLocale: 'ro' | 'en'
  workingHoursStart: string
  workingHoursEnd: string
}

export async function listKindergartens(client: Client): Promise<Result<KindergartenRow[]>> {
  const { data, error } = await client.from('kindergartens').select('*').is('deleted_at', null).order('name')

  if (error || !data) return { success: false, error: error?.message ?? 'list_failed' }
  return { success: true, data }
}

export async function createKindergarten(
  client: Client,
  details: DetailsInput,
  actorId: string,
): Promise<Result<KindergartenRow>> {
  const { data, error } = await client
    .from('kindergartens')
    .insert({
      name: details.name,
      address: details.address ?? null,
      city: details.city ?? null,
      phone: details.phone ?? null,
      settings: {
        timezone: 'Europe/Bucharest',
        default_locale: 'ro',
        working_hours: { start: '07:30', end: '18:00' },
      },
      created_by: actorId,
      updated_by: actorId,
    })
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data }
}

export async function updateKindergartenDetails(
  client: Client,
  id: string,
  details: DetailsInput,
  actorId: string,
): Promise<Result<KindergartenRow>> {
  const { data, error } = await client
    .from('kindergartens')
    .update({
      name: details.name,
      address: details.address ?? null,
      city: details.city ?? null,
      phone: details.phone ?? null,
      updated_by: actorId,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data }
}

export async function updateKindergartenSettings(
  client: Client,
  id: string,
  settings: SettingsInput,
  actorId: string,
): Promise<Result<KindergartenRow>> {
  const { data, error } = await client
    .from('kindergartens')
    .update({
      settings: {
        timezone: settings.timezone,
        default_locale: settings.defaultLocale,
        working_hours: { start: settings.workingHoursStart, end: settings.workingHoursEnd },
      },
      updated_by: actorId,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data }
}

export async function setKindergartenStatus(
  client: Client,
  id: string,
  status: KindergartenStatus,
  actorId: string,
): Promise<Result<KindergartenRow>> {
  const { data, error } = await client
    .from('kindergartens')
    .update({ status, updated_by: actorId })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data }
}
