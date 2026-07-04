import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { TrainerAvailability } from '../types/pool.types'

type Client = SupabaseClient<Database>

function toAvailability(row: Record<string, unknown>): TrainerAvailability {
  return {
    id: row.id as string,
    kindergartenId: row.kindergarten_id as string,
    trainerUserId: row.trainer_user_id as string,
    weekday: row.weekday as number,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
  }
}

export async function listAvailability(
  client: Client,
  kindergartenId: string,
  trainerUserId: string,
): Promise<Result<TrainerAvailability[]>> {
  const { data, error } = await client
    .from('pool_trainer_availability')
    .select('*')
    .eq('kindergarten_id', kindergartenId)
    .eq('trainer_user_id', trainerUserId)
    .is('deleted_at', null)
    .order('weekday')

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toAvailability(r as Record<string, unknown>)) }
}

export async function addAvailability(
  client: Client,
  input: { kindergartenId: string; trainerUserId: string; weekday: number; startTime: string; endTime: string },
  actorId: string,
): Promise<Result<TrainerAvailability>> {
  const { data, error } = await client
    .from('pool_trainer_availability')
    .insert({
      kindergarten_id: input.kindergartenId,
      trainer_user_id: input.trainerUserId,
      weekday: input.weekday,
      start_time: input.startTime,
      end_time: input.endTime,
      created_by: actorId,
      updated_by: actorId,
    })
    .select()
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data: toAvailability(data as Record<string, unknown>) }
}

export async function removeAvailability(
  client: Client,
  id: string,
  actorId: string,
): Promise<Result<void>> {
  const { error } = await client
    .from('pool_trainer_availability')
    .update({ deleted_at: new Date().toISOString(), updated_by: actorId })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}
