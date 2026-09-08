import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { Group } from '../types/groups.types'

type Client = SupabaseClient<Database>

function toGroup(row: Record<string, unknown>, childrenCount = 0): Group {
  return {
    id: row.id as string,
    name: row.name as string,
    ageRange: (row.age_range as string | null),
    educatorId: (row.educator_id as string | null),
    educatorName: ((row.users as { full_name: string } | null)?.full_name) ?? null,
    status: row.status as 'active' | 'archived',
    kindergartenId: row.kindergarten_id as string,
    capacity: (row.capacity as number | null),
    childrenCount,
  }
}

export async function listGroups(
  client: Client,
  kindergartenId: string,
): Promise<Result<Group[]>> {
  let groupsQ = client
    .from('groups')
    .select('*, users!educator_id(full_name)')
    .is('deleted_at', null)
    .order('name')

  let childrenQ = client
    .from('children')
    .select('group_id')
    .eq('status', 'enrolled')
    .is('deleted_at', null)

  if (kindergartenId !== 'ALL') {
    groupsQ = groupsQ.eq('kindergarten_id', kindergartenId)
    childrenQ = childrenQ.eq('kindergarten_id', kindergartenId)
  }

  const [groupsResult, childrenResult] = await Promise.all([groupsQ, childrenQ])

  if (groupsResult.error) return { success: false, error: groupsResult.error.message }
  if (childrenResult.error) return { success: false, error: childrenResult.error.message }

  const countMap: Record<string, number> = {}
  for (const c of childrenResult.data ?? []) {
    if (c.group_id) countMap[c.group_id] = (countMap[c.group_id] ?? 0) + 1
  }

  return {
    success: true,
    data: (groupsResult.data ?? []).map(r =>
      toGroup(r as Record<string, unknown>, countMap[(r as { id: string }).id] ?? 0),
    ),
  }
}

export async function getGroup(
  client: Client,
  id: string,
): Promise<Result<Group>> {
  const [groupResult, countResult] = await Promise.all([
    client.from('groups').select('*, users!educator_id(full_name)').eq('id', id).single(),
    client
      .from('children')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', id)
      .eq('status', 'enrolled')
      .is('deleted_at', null),
  ])

  if (groupResult.error || !groupResult.data)
    return { success: false, error: groupResult.error?.message ?? 'not_found' }
  if (countResult.error) return { success: false, error: countResult.error.message }

  return {
    success: true,
    data: toGroup(groupResult.data as Record<string, unknown>, countResult.count ?? 0),
  }
}

export async function createGroup(
  client: Client,
  input: {
    name: string
    ageRange?: string | null
    educatorId?: string | null
    kindergartenId: string
    capacity?: number | null
  },
): Promise<Result<Group>> {
  const { data, error } = await client
    .from('groups')
    .insert({
      name: input.name,
      age_range: input.ageRange ?? null,
      educator_id: input.educatorId ?? null,
      kindergarten_id: input.kindergartenId,
      capacity: input.capacity ?? null,
    })
    .select('*, users!educator_id(full_name)')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data: toGroup(data as Record<string, unknown>) }
}

export async function updateGroup(
  client: Client,
  id: string,
  input: {
    name?: string
    ageRange?: string | null
    educatorId?: string | null
    capacity?: number | null
  },
): Promise<Result<Group>> {
  const fieldMap: Record<string, string> = {
    name: 'name',
    ageRange: 'age_range',
    educatorId: 'educator_id',
    capacity: 'capacity',
  }

  const payload: any = {}
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined) {
      payload[fieldMap[key]] = value
    }
  })

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
): Promise<Result<void>> {
  const { error } = await client
    .from('groups')
    .update({ status: 'archived' })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}

export async function restoreGroup(
  client: Client,
  id: string,
): Promise<Result<void>> {
  const { error } = await client
    .from('groups')
    .update({ status: 'active' })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}
