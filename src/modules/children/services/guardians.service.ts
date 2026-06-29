import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { Guardian, GuardianRelationship } from '../types/guardian.types'

type Client = SupabaseClient<Database>

function toGuardian(row: Record<string, unknown>): Guardian {
  const firstName = row.first_name as string
  const lastName  = row.last_name as string
  return {
    id:             row.id as string,
    childId:        row.child_id as string,
    kindergartenId: row.kindergarten_id as string,
    firstName,
    lastName,
    fullName:       `${firstName} ${lastName}`,
    email:          (row.email as string | null) ?? null,
    phone:          (row.phone as string | null) ?? null,
    relationship:   row.relationship as GuardianRelationship,
    isPrimary:      row.is_primary as boolean,
    notes:          (row.notes as string | null) ?? null,
  }
}

export async function listGuardians(
  client: Client,
  childId: string,
): Promise<Result<Guardian[]>> {
  const { data, error } = await client
    .from('guardians')
    .select('*')
    .eq('child_id', childId)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .order('last_name')

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: (data ?? []).map(r => toGuardian(r as Record<string, unknown>)),
  }
}

export async function createGuardian(
  client: Client,
  input: {
    childId: string
    kindergartenId: string
    firstName: string
    lastName: string
    email?: string | null
    phone?: string | null
    relationship: GuardianRelationship
    isPrimary?: boolean
    notes?: string | null
  },
  actorId: string,
): Promise<Result<Guardian>> {
  const { data, error } = await client
    .from('guardians')
    .insert({
      child_id:        input.childId,
      kindergarten_id: input.kindergartenId,
      first_name:      input.firstName,
      last_name:       input.lastName,
      email:           input.email ?? null,
      phone:           input.phone ?? null,
      relationship:    input.relationship,
      is_primary:      input.isPrimary ?? false,
      notes:           input.notes ?? null,
      created_by:      actorId,
      updated_by:      actorId,
    })
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data: toGuardian(data as Record<string, unknown>) }
}

export async function updateGuardian(
  client: Client,
  id: string,
  input: {
    firstName?: string
    lastName?: string
    email?: string | null
    phone?: string | null
    relationship?: GuardianRelationship
    isPrimary?: boolean
    notes?: string | null
  },
  actorId: string,
): Promise<Result<Guardian>> {
  const payload: Database['public']['Tables']['guardians']['Update'] = { updated_by: actorId }
  if (input.firstName    !== undefined) payload.first_name   = input.firstName
  if (input.lastName     !== undefined) payload.last_name    = input.lastName
  if (input.email        !== undefined) payload.email        = input.email
  if (input.phone        !== undefined) payload.phone        = input.phone
  if (input.relationship !== undefined) payload.relationship = input.relationship
  if (input.isPrimary    !== undefined) payload.is_primary   = input.isPrimary
  if (input.notes        !== undefined) payload.notes        = input.notes

  const { data, error } = await client
    .from('guardians')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'update_failed' }
  return { success: true, data: toGuardian(data as Record<string, unknown>) }
}

export async function removeGuardian(
  client: Client,
  id: string,
  actorId: string,
): Promise<Result<void>> {
  const { error } = await client
    .from('guardians')
    .update({ deleted_at: new Date().toISOString(), updated_by: actorId })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}
