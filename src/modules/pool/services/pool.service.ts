import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { TrainerAvailability, SchedulePattern } from '../types/pool.types'

type Client = SupabaseClient<Database>

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

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

function toPattern(row: Record<string, unknown>): SchedulePattern {
  return {
    id: row.id as string,
    kindergartenId: row.kindergarten_id as string,
    trainerUserId: row.trainer_user_id as string,
    weekday: row.weekday as number,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    defaultGroupId: (row.default_group_id as string | null) ?? null,
    capacity: row.capacity as number,
    activeFrom: row.active_from as string,
    activeUntil: (row.active_until as string | null) ?? null,
  }
}

export async function createPattern(
  client: Client,
  input: {
    kindergartenId: string
    trainerUserId: string
    weekday: number
    startTime: string
    endTime: string
    defaultGroupId?: string | null
    capacity: number
    activeFrom: string
    activeUntil?: string | null
  },
  actorId: string,
): Promise<Result<SchedulePattern>> {
  const { data: availabilityRows, error: availabilityError } = await client
    .from('pool_trainer_availability')
    .select('start_time, end_time')
    .eq('trainer_user_id', input.trainerUserId)
    .eq('kindergarten_id', input.kindergartenId)
    .eq('weekday', input.weekday)
    .is('deleted_at', null)

  if (availabilityError) return { success: false, error: availabilityError.message }

  const inputStart = timeToMinutes(input.startTime)
  const inputEnd = timeToMinutes(input.endTime)
  const fits = (availabilityRows ?? []).some(row => {
    const availRow = row as { start_time: string; end_time: string }
    return inputStart >= timeToMinutes(availRow.start_time) && inputEnd <= timeToMinutes(availRow.end_time)
  })
  if (!fits) return { success: false, error: 'outside_trainer_availability' }

  const { data, error } = await client
    .from('pool_schedule_patterns')
    .insert({
      kindergarten_id: input.kindergartenId,
      trainer_user_id: input.trainerUserId,
      weekday: input.weekday,
      start_time: input.startTime,
      end_time: input.endTime,
      default_group_id: input.defaultGroupId ?? null,
      capacity: input.capacity,
      active_from: input.activeFrom,
      active_until: input.activeUntil ?? null,
      created_by: actorId,
      updated_by: actorId,
    })
    .select()
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data: toPattern(data as Record<string, unknown>) }
}

export async function listPatterns(
  client: Client,
  kindergartenId: string,
  trainerUserId?: string,
): Promise<Result<SchedulePattern[]>> {
  let query = client
    .from('pool_schedule_patterns')
    .select('*')
    .eq('kindergarten_id', kindergartenId)
    .is('deleted_at', null)
    .order('weekday')

  if (trainerUserId) query = query.eq('trainer_user_id', trainerUserId)

  const { data, error } = await query
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toPattern(r as Record<string, unknown>)) }
}

export async function deletePattern(
  client: Client,
  id: string,
  actorId: string,
): Promise<Result<void>> {
  const { error } = await client
    .from('pool_schedule_patterns')
    .update({ deleted_at: new Date().toISOString(), updated_by: actorId })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}
