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

  // Primary guardian comes from the joined guardians array (may be null if no guardians)
  type RawGuardian = {
    first_name: string; last_name: string
    phone: string | null; email: string | null
    relationship: string; is_primary: boolean; deleted_at: string | null
  }
  const rawGuardians = (row.guardians as RawGuardian[] | null) ?? []
  const primary = rawGuardians.find(g => g.is_primary && !g.deleted_at) ?? null

  return {
    id: row.id as string,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    birthDate,
    age: computeAge(birthDate),
    bloodGroup: (row.blood_group as string | null),
    allergies: (row.allergies as string | null),
    medicalNotes: (row.medical_notes as string | null),
    nationalId: (row.national_id as string | null),
    idType: (row.id_type as NationalIdType | null),
    status: row.status as ChildStatus,
    groupId: (row.group_id as string | null),
    groupName: ((row.groups as { name: string } | null)?.name) ?? null,
    kindergartenId: row.kindergarten_id as string,
    primaryGuardian: primary
      ? {
          fullName:     `${primary.first_name} ${primary.last_name}`,
          phone:        primary.phone,
          email:        primary.email,
          relationship: primary.relationship,
        }
      : null,
    contractNumber: (row.contract_number as string | null),
    contractSignedAt: (row.contract_signed_at as string | null),
    enrollmentStartDate: (row.enrollment_start_date as string | null),
  }
}

export async function listChildren(
  client: Client,
  kindergartenId: string,
): Promise<Result<Child[]>> {
  let q = client
    .from('children')
    .select('*, groups(name), guardians(first_name, last_name, phone, email, relationship, is_primary, deleted_at)')
    .is('deleted_at', null)
    .order('last_name')
    .order('first_name')

  q = q.eq('kindergarten_id', kindergartenId)

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
    contractNumber?: string | null; contractSignedAt?: string | null; enrollmentStartDate?: string | null
  },
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
      contract_number: input.contractNumber ?? null,
      contract_signed_at: input.contractSignedAt ?? null,
      enrollment_start_date: input.enrollmentStartDate ?? null,
      consent:       {},
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
    contractNumber?: string | null; contractSignedAt?: string | null; enrollmentStartDate?: string | null
  },
): Promise<Result<Child>> {
  const fieldMap: Record<string, string> = {
    firstName: 'first_name',
    lastName: 'last_name',
    birthDate: 'birth_date',
    bloodGroup: 'blood_group',
    allergies: 'allergies',
    medicalNotes: 'medical_notes',
    nationalId: 'national_id',
    idType: 'id_type',
    groupId: 'group_id',
    contractNumber: 'contract_number',
    contractSignedAt: 'contract_signed_at',
    enrollmentStartDate: 'enrollment_start_date',
  }

  const payload: any = {}
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined) {
      payload[fieldMap[key]] = value
    }
  })

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
): Promise<Result<void>> {
  const payload: Database['public']['Tables']['children']['Update'] = {
    status,
  }
  const { error } = await client.from('children').update(payload).eq('id', id)
  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}

export async function listChildrenByGroup(
  client: Client,
  groupId: string,
): Promise<Result<Child[]>> {
  const { data, error } = await client
    .from('children')
    .select('*, groups(name)')
    .eq('group_id', groupId)
    .eq('status', 'enrolled')
    .is('deleted_at', null)
    .order('last_name')
    .order('first_name')

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toChild(r as Record<string, unknown>)) }
}

export async function getChild(
  client: Client,
  id: string,
): Promise<Result<Child>> {
  const { data, error } = await client
    .from('children')
    .select('*, groups(name)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'not_found' }
  return { success: true, data: toChild(data as Record<string, unknown>) }
}
