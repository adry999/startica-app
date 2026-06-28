import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'

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
    .neq('role', 'super_admin')
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
