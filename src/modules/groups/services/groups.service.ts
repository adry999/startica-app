import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { Group } from '../types/groups.types'

type Client = SupabaseClient<Database>

function toGroup(row: Record<string, unknown>): Group {
  return {
    id: row.id as string,
    name: row.name as string,
    ageRange: (row.age_range as string | null) ?? null,
    educatorId: (row.educator_id as string | null) ?? null,
    educatorName: ((row.users as { full_name: string } | null)?.full_name) ?? null,
    status: row.status as 'active' | 'archived',
    kindergartenId: row.kindergarten_id as string,
  }
}

export async function listGroups(
  client: Client,
  kindergartenId: string,
): Promise<Result<Group[]>> {
  let q = client
    .from('groups')
    .select('*, users!educator_id(full_name)')
    .is('deleted_at', null)
    .order('name')

  if (kindergartenId !== 'ALL') q = q.eq('kindergarten_id', kindergartenId)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toGroup(r as Record<string, unknown>)) }
}

export async function createGroup(
  client: Client,
  input: { name: string; ageRange?: string | null; educatorId?: string | null; kindergartenId: string },
  actorId: string,
): Promise<Result<Group>> {
  const { data, error } = await client
    .from('groups')
    .insert({
      name: input.name,
      age_range: input.ageRange ?? null,
      educator_id: input.educatorId ?? null,
      kindergarten_id: input.kindergartenId,
      created_by: actorId,
      updated_by: actorId,
    })
    .select('*, users!educator_id(full_name)')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data: toGroup(data as Record<string, unknown>) }
}

export async function updateGroup(
  client: Client,
  id: string,
  input: { name?: string; ageRange?: string | null; educatorId?: string | null },
  actorId: string,
): Promise<Result<Group>> {
  const payload: Database['public']['Tables']['groups']['Update'] = { updated_by: actorId }
  if (input.name !== undefined) payload.name = input.name
  if (input.ageRange !== undefined) payload.age_range = input.ageRange
  if (input.educatorId !== undefined) payload.educator_id = input.educatorId

  const { data, error } = await client
    .from('groups')
    .update(payload)
    .eq('id', id)
    .select('*, users!educator_id(full_name)')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data: toGroup(data as Record<string, unknown>) }
}

export async function archiveGroup(
  client: Client,
  id: string,
  actorId: string,
): Promise<Result<void>> {
  const { error } = await client
    .from('groups')
    .update({ status: 'archived', updated_by: actorId })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}

export async function restoreGroup(
  client: Client,
  id: string,
  actorId: string,
): Promise<Result<void>> {
  const { error } = await client
    .from('groups')
    .update({ status: 'active', updated_by: actorId })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}
