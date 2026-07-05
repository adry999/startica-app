import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { TrainerAvailability, SchedulePattern, PoolSession } from '../types/pool.types'

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

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY

export function computeOccurrenceDates(
  weekday: number,
  activeFrom: string,
  activeUntil: string | null,
  windowWeeks: number,
  today: Date = new Date(),
): string[] {
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())

  const [fy, fm, fd] = activeFrom.split('-').map(Number)
  const fromUtc = Date.UTC(fy!, fm! - 1, fd!)
  const rangeStart = Math.max(todayUtc, fromUtc)

  const windowEndUtc = todayUtc + windowWeeks * MS_PER_WEEK
  let untilUtc = Infinity
  if (activeUntil) {
    const [uy, um, ud] = activeUntil.split('-').map(Number)
    untilUtc = Date.UTC(uy!, um! - 1, ud!)
  }
  const rangeEnd = Math.min(windowEndUtc, untilUtc)

  const currentWeekday = new Date(rangeStart).getUTCDay()
  const daysUntilTarget = (weekday - currentWeekday + 7) % 7
  let cursor = rangeStart + daysUntilTarget * MS_PER_DAY

  const dates: string[] = []
  while (cursor <= rangeEnd) {
    dates.push(new Date(cursor).toISOString().slice(0, 10))
    cursor += MS_PER_WEEK
  }
  return dates
}

const GENERATION_WINDOW_WEEKS = 8

function toSession(row: Record<string, unknown>): PoolSession {
  const participants = row.pool_session_participants as Array<{ count: number }> | undefined
  return {
    id: row.id as string,
    kindergartenId: row.kindergarten_id as string,
    trainerUserId: row.trainer_user_id as string,
    sourcePatternId: (row.source_pattern_id as string | null) ?? null,
    sessionDate: row.session_date as string,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    capacity: row.capacity as number,
    groupId: (row.group_id as string | null) ?? null,
    status: row.status as 'scheduled' | 'cancelled',
    participantCount: participants?.[0]?.count ?? 0,
  }
}

export async function generateMissingSessions(
  client: Client,
  kindergartenId: string,
  today: Date = new Date(),
): Promise<Result<void>> {
  const { data: patterns, error: patternsError } = await client
    .from('pool_schedule_patterns')
    .select('*')
    .eq('kindergarten_id', kindergartenId)
    .is('deleted_at', null)

  if (patternsError) return { success: false, error: patternsError.message }

  for (const pattern of (patterns ?? []) as Array<Record<string, unknown>>) {
    const patternId = pattern.id as string
    const occurrenceDates = computeOccurrenceDates(
      pattern.weekday as number,
      pattern.active_from as string,
      (pattern.active_until as string | null) ?? null,
      GENERATION_WINDOW_WEEKS,
      today,
    )

    const { data: existing, error: existingError } = await client
      .from('pool_sessions')
      .select('session_date')
      .eq('source_pattern_id', patternId)
      .is('deleted_at', null)

    if (existingError) return { success: false, error: existingError.message }

    const existingDates = new Set((existing ?? []).map(r => (r as { session_date: string }).session_date))
    const missingDates = occurrenceDates.filter(d => !existingDates.has(d))
    if (missingDates.length === 0) continue

    const rowsToInsert = missingDates.map(date => ({
      kindergarten_id: kindergartenId,
      trainer_user_id: pattern.trainer_user_id as string,
      source_pattern_id: patternId,
      session_date: date,
      start_time: pattern.start_time as string,
      end_time: pattern.end_time as string,
      capacity: pattern.capacity as number,
      group_id: (pattern.default_group_id as string | null) ?? null,
      status: 'scheduled' as const,
    }))

    const { data: insertedSessions, error: insertError } = await client
      .from('pool_sessions')
      .insert(rowsToInsert)
      .select()

    if (insertError) return { success: false, error: insertError.message }

    const defaultGroupId = pattern.default_group_id as string | null
    if (!defaultGroupId) continue

    const { data: activeChildren, error: childrenError } = await client
      .from('children')
      .select('id')
      .eq('group_id', defaultGroupId)
      .eq('status', 'enrolled')
      .is('deleted_at', null)

    if (childrenError) return { success: false, error: childrenError.message }
    if (!activeChildren || activeChildren.length === 0) continue

    const participantRows = (insertedSessions ?? []).flatMap(session =>
      activeChildren.map(child => ({
        session_id: (session as { id: string }).id,
        kindergarten_id: kindergartenId,
        child_id: (child as { id: string }).id,
        status: 'enrolled' as const,
      })),
    )

    if (participantRows.length > 0) {
      const { error: participantsError } = await client
        .from('pool_session_participants')
        .insert(participantRows)
      if (participantsError) return { success: false, error: participantsError.message }
    }
  }

  return { success: true, data: undefined }
}

export async function listSessions(
  client: Client,
  kindergartenId: string,
  today: Date = new Date(),
): Promise<Result<PoolSession[]>> {
  const generation = await generateMissingSessions(client, kindergartenId, today)
  if (!generation.success) return generation

  const { data, error } = await client
    .from('pool_sessions')
    .select('*, pool_session_participants(count)')
    .eq('kindergarten_id', kindergartenId)
    .is('deleted_at', null)
    .order('session_date')

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toSession(r as Record<string, unknown>)) }
}
