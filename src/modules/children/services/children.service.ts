import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { Child } from '../types/children.types'
import { computeAge } from '../utils/childAge'

type Client = SupabaseClient<Database>
type ChildStatus = Database['public']['Enums']['child_status']
type NationalIdType = Database['public']['Enums']['national_id_type']

function toChild(row: Record<string, unknown>): Child {
  const firstName = row.first_name as string
  const lastName  = row.last_name as string
  const birthDate = row.birth_date as string
  return {
    id:           row.id as string,
    firstName,
    lastName,
    fullName:     `${firstName} ${lastName}`,
    birthDate,
    age:          computeAge(birthDate),
    bloodGroup:   (row.blood_group as string | null) ?? null,
    allergies:    (row.allergies as string | null) ?? null,
    medicalNotes: (row.medical_notes as string | null) ?? null,
    nationalId:   (row.national_id as string | null) ?? null,
    idType:       (row.id_type as NationalIdType | null) ?? null,
    status:       row.status as ChildStatus,
    groupId:      (row.group_id as string | null) ?? null,
    groupName:    ((row.groups as { name: string } | null)?.name) ?? null,
    kindergartenId: row.kindergarten_id as string,
  }
}

export async function listChildren(
  client: Client,
  kindergartenId: string,
): Promise<Result<Child[]>> {
  let q = client
    .from('children')
    .select('*, groups(name)')
    .is('deleted_at', null)
    .order('last_name')
    .order('first_name')

  if (kindergartenId !== 'ALL') q = q.eq('kindergarten_id', kindergartenId)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toChild(r as Record<string, unknown>)) }
}

export async function createChild(
  client: Client,
  input: {
    firstName: string; lastName: string; birthDate: string
    bloodGroup?: string | null; allergies?: string | null; medicalNotes?: string | null
    nationalId?: string | null; idType?: NationalIdType | null
    groupId?: string | null; kindergartenId: string
  },
  actorId: string,
): Promise<Result<Child>> {
  const { data, error } = await client
    .from('children')
    .insert({
      first_name:    input.firstName,
      last_name:     input.lastName,
      birth_date:    input.birthDate,
      blood_group:   input.bloodGroup ?? null,
      allergies:     input.allergies ?? null,
      medical_notes: input.medicalNotes ?? null,
      national_id:   input.nationalId ?? null,
      id_type:       input.idType ?? null,
      group_id:      input.groupId ?? null,
      kindergarten_id: input.kindergartenId,
      consent:       {},
      created_by:    actorId,
      updated_by:    actorId,
    })
    .select('*, groups(name)')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data: toChild(data as Record<string, unknown>) }
}

export async function updateChild(
  client: Client,
  id: string,
  input: {
    firstName?: string; lastName?: string; birthDate?: string
    bloodGroup?: string | null; allergies?: string | null; medicalNotes?: string | null
    nationalId?: string | null; idType?: NationalIdType | null; groupId?: string | null
  },
  actorId: string,
): Promise<Result<Child>> {
  const payload: Database['public']['Tables']['children']['Update'] = { updated_by: actorId }
  if (input.firstName   !== undefined) payload.first_name    = input.firstName
  if (input.lastName    !== undefined) payload.last_name     = input.lastName
  if (input.birthDate   !== undefined) payload.birth_date    = input.birthDate
  if (input.bloodGroup  !== undefined) payload.blood_group   = input.bloodGroup
  if (input.allergies   !== undefined) payload.allergies     = input.allergies
  if (input.medicalNotes !== undefined) payload.medical_notes = input.medicalNotes
  if (input.nationalId  !== undefined) payload.national_id   = input.nationalId
  if (input.idType      !== undefined) payload.id_type       = input.idType
  if (input.groupId     !== undefined) payload.group_id      = input.groupId

  const { data, error } = await client
    .from('children')
    .update(payload)
    .eq('id', id)
    .select('*, groups(name)')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data: toChild(data as Record<string, unknown>) }
}

export async function setChildStatus(
  client: Client,
  id: string,
  status: ChildStatus,
  actorId: string,
): Promise<Result<void>> {
  const payload: Database['public']['Tables']['children']['Update'] = {
    status,
    updated_by: actorId,
  }
  const { error } = await client.from('children').update(payload).eq('id', id)
  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}
