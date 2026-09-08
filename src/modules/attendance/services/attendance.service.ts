import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'

type Client = SupabaseClient<Database>
export type AttendanceRow = Database['public']['Tables']['attendance']['Row']
export type AttendanceStatus = Database['public']['Enums']['attendance_status']

export async function listByDate(
  client: Client,
  kindergartenId: string,
  date: string,
): Promise<Result<AttendanceRow[]>> {
  const { data, error } = await client
    .from('attendance')
    .select('*')
    .eq('kindergarten_id', kindergartenId)
    .eq('date', date)
    .is('deleted_at', null)
    .order('child_id')

  if (error) return { success: false, error: error.message }
  return { success: true, data: data ?? [] }
}

export async function listByGroup(
  client: Client,
  groupId: string,
  date: string,
): Promise<Result<AttendanceRow[]>> {
  const { data, error } = await client
    .from('attendance')
    .select('*')
    .eq('group_id', groupId)
    .eq('date', date)
    .is('deleted_at', null)
    .order('child_id')

  if (error) return { success: false, error: error.message }
  return { success: true, data: data ?? [] }
}

export async function listByChild(
  client: Client,
  childId: string,
  startDate: string,
  endDate: string,
): Promise<Result<AttendanceRow[]>> {
  const { data, error } = await client
    .from('attendance')
    .select('*')
    .eq('child_id', childId)
    .gte('date', startDate)
    .lte('date', endDate)
    .is('deleted_at', null)
    .order('date', { ascending: false })

  if (error) return { success: false, error: error.message }
  return { success: true, data: data ?? [] }
}

export async function markAttendance(
  client: Client,
  kindergartenId: string,
  childId: string,
  date: string,
  status: AttendanceStatus,
  groupId: string | null,
  notes: string | null,
  userId: string,
): Promise<Result<AttendanceRow>> {
  const { data, error } = await client
    .from('attendance')
    .upsert(
      {
        kindergarten_id: kindergartenId,
        child_id: childId,
        date,
        status,
        group_id: groupId,
        notes,
        marked_by: userId,
        created_by: userId,
        updated_by: userId,
      },
      { onConflict: 'kindergarten_id,child_id,date' },
    )
    .select('*')
    .single()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: 'mark_failed' }
  return { success: true, data }
}

export async function markGroupAttendance(
  client: Client,
  kindergartenId: string,
  groupId: string,
  date: string,
  childIds: string[],
  status: AttendanceStatus,
  userId: string,
): Promise<Result<null>> {
  const records = childIds.map((childId) => ({
    kindergarten_id: kindergartenId,
    child_id: childId,
    group_id: groupId,
    date,
    status,
    marked_by: userId,
    created_by: userId,
    updated_by: userId,
  }))

  const { error } = await client
    .from('attendance')
    .upsert(records, { onConflict: 'kindergarten_id,child_id,date' })

  if (error) return { success: false, error: error.message }
  return { success: true, data: null }
}
