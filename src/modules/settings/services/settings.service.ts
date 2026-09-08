import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'

type Client = SupabaseClient<Database>
type KindergartenRow = Database['public']['Tables']['kindergartens']['Row']
type KindergartenUpdate = Database['public']['Tables']['kindergartens']['Update']

// kindergartens.settings is a free-form jsonb column; this is the shape the
// app actually reads and writes.
export interface KindergartenSettings {
  timezone?: string
  default_locale?: 'ro' | 'en'
  working_hours?: { start: string; end: string }
}

export async function updateOwnProfile(
  client: Client,
  userId: string,
  fullName: string,
): Promise<Result<void>> {
  const { error } = await client
    .from('users')
    .update({ full_name: fullName, updated_by: userId })
    .eq('id', userId)
    .is('deleted_at', null)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}

export async function updateOwnAvatar(
  client: Client,
  userId: string,
  file: File,
): Promise<Result<string>> {
  const fileName = `${userId}/${Date.now()}-${file.name}`
  const { error } = await client.storage
    .from('avatars')
    .upload(fileName, file, { upsert: true })

  if (error) return { success: false, error: error.message }

  const { data: publicUrl } = client.storage
    .from('avatars')
    .getPublicUrl(fileName)

  const { error: updateError } = await client
    .from('users')
    .update({ avatar_url: publicUrl.publicUrl, updated_by: userId })
    .eq('id', userId)

  if (updateError) return { success: false, error: updateError.message }
  return { success: true, data: publicUrl.publicUrl }
}

export async function requestOwnPasswordReset(
  client: Client,
  email: string,
  redirectTo: string,
): Promise<Result<void>> {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}

export async function fetchKindergartenSettings(
  client: Client,
  kindergartenId: string,
): Promise<Result<KindergartenRow>> {
  const { data, error } = await client
    .from('kindergartens')
    .select('*')
    .eq('id', kindergartenId)
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'not_found' }
  return { success: true, data }
}

export async function updateKindergartenSettings(
  client: Client,
  kindergartenId: string,
  userId: string,
  input: {
    timezone?: string
    defaultLocale?: 'ro' | 'en'
    workingHoursStart?: string
    workingHoursEnd?: string
    logoUrl?: string
  },
): Promise<Result<KindergartenRow>> {
  const payload: KindergartenUpdate = {}
  const settings: KindergartenSettings = {}

  if (input.timezone) settings.timezone = input.timezone
  if (input.defaultLocale) settings.default_locale = input.defaultLocale
  if (input.workingHoursStart || input.workingHoursEnd) {
    settings.working_hours = {
      start: input.workingHoursStart ?? '07:30',
      end: input.workingHoursEnd ?? '18:00',
    }
  }

  if (Object.keys(settings).length > 0) payload.settings = settings as KindergartenUpdate['settings']
  if (input.logoUrl) payload.logo_url = input.logoUrl
  payload.updated_by = userId

  const { data, error } = await client
    .from('kindergartens')
    .update(payload)
    .eq('id', kindergartenId)
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data }
}
