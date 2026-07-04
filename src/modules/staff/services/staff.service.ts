import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { ModuleKey } from '~/modules/auth/types/moduleAccess.types'
import { STAFF_EXCLUDED_ROLES } from '~/shared/utils/staffFilters'

type Client = SupabaseClient<Database>
export type UserRow = Database['public']['Tables']['users']['Row']
type UserRole = Database['public']['Enums']['user_role']
type UserStatus = Database['public']['Enums']['user_status']

export async function listStaff(
  client: Client,
  kindergartenId: string,
): Promise<Result<UserRow[]>> {
  const { data, error } = await client
    .from('users')
    .select('*, user_kindergartens!inner(kindergarten_id)')
    .eq('user_kindergartens.kindergarten_id', kindergartenId)
    .is('deleted_at', null)
    .neq('role', STAFF_EXCLUDED_ROLES[0])
    .order('full_name')

  if (error || !data) return { success: false, error: error?.message ?? 'list_failed' }
  return {
    success: true,
    data: data.map(({ user_kindergartens: _join, ...user }) => user as UserRow),
  }
}

export async function updateStaffProfile(
  client: Client,
  userId: string,
  data: { fullName: string; role?: UserRole },
  actorId: string,
): Promise<Result<UserRow>> {
  const payload: Database['public']['Tables']['users']['Update'] = {
    full_name: data.fullName,
    updated_by: actorId,
    ...(data.role !== undefined && { role: data.role }),
  }

  const { data: updated, error } = await client
    .from('users')
    .update(payload)
    .eq('id', userId)
    .select('*')
    .single()

  if (error || !updated) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data: updated }
}

export async function setStaffStatus(
  client: Client,
  userId: string,
  status: UserStatus,
  actorId: string,
): Promise<Result<UserRow>> {
  const { data, error } = await client
    .from('users')
    .update({ status, updated_by: actorId })
    .eq('id', userId)
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data }
}

export async function removeFromKindergarten(
  client: Client,
  userId: string,
  kindergartenId: string,
): Promise<Result<null>> {
  const { error } = await client
    .from('user_kindergartens')
    .delete()
    .eq('user_id', userId)
    .eq('kindergarten_id', kindergartenId)

  if (error) return { success: false, error: error.message }
  return { success: true, data: null }
}

export type UserModuleRow = Database['public']['Tables']['user_modules']['Row']

export async function listUserModules(
  client: Client,
  userId: string,
  kindergartenId: string,
): Promise<Result<UserModuleRow[]>> {
  const { data, error } = await client
    .from('user_modules')
    .select('*')
    .eq('user_id', userId)
    .eq('kindergarten_id', kindergartenId)
    .is('deleted_at', null)

  if (error || !data) return { success: false, error: error?.message ?? 'list_failed' }
  return { success: true, data }
}

export async function grantModule(
  client: Client,
  userId: string,
  kindergartenId: string,
  moduleKey: ModuleKey,
  actorId: string,
): Promise<Result<UserModuleRow>> {
  // RLS on user_modules filters deleted_at IS NULL for all readers, so this
  // lookup can only ever see a live row. A re-grant after revoke will never
  // find the soft-deleted row here — it inserts a fresh one instead (the
  // partial unique index only covers live rows, so that's safe).
  const { data: existing, error: lookupError } = await client
    .from('user_modules')
    .select('*')
    .eq('user_id', userId)
    .eq('kindergarten_id', kindergartenId)
    .eq('module_key', moduleKey)
    .is('deleted_at', null)
    .maybeSingle()

  if (lookupError) return { success: false, error: lookupError.message ?? 'grant_failed' }

  // Live grant already exists — re-granting is a no-op.
  if (existing) return { success: true, data: existing }

  const { data, error } = await client
    .from('user_modules')
    .insert({
      user_id: userId,
      kindergarten_id: kindergartenId,
      module_key: moduleKey,
      granted_by: actorId,
    })
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'grant_failed' }
  return { success: true, data }
}

export async function revokeModule(
  client: Client,
  userId: string,
  kindergartenId: string,
  moduleKey: ModuleKey,
): Promise<Result<null>> {
  const { error } = await client
    .from('user_modules')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('kindergarten_id', kindergartenId)
    .eq('module_key', moduleKey)
    .is('deleted_at', null)

  if (error) return { success: false, error: error.message }
  return { success: true, data: null }
}

export async function listAssignedKindergartens(
  client: Client,
  userId: string,
): Promise<Result<Array<{ id: string; name: string }>>> {
  const { data, error } = await client
    .from('user_kindergartens')
    .select('kindergarten_id, kindergartens!inner(id, name)')
    .eq('user_id', userId)

  if (error || !data) return { success: false, error: error?.message ?? 'list_failed' }
  return {
    success: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data.map((row: any) => ({ id: row.kindergartens.id, name: row.kindergartens.name })),
  }
}
