export interface TrainerAvailability {
  id: string
  kindergartenId: string
  trainerUserId: string
  weekday: number // 0 = Sunday .. 6 = Saturday
  startTime: string // 'HH:MM'
  endTime: string
}

export interface SchedulePattern {
  id: string
  kindergartenId: string
  trainerUserId: string
  weekday: number
  startTime: string
  endTime: string
  defaultGroupId: string | null
  capacity: number
  activeFrom: string // 'YYYY-MM-DD'
  activeUntil: string | null
}

export interface PoolSession {
  id: string
  kindergartenId: string
  trainerUserId: string
  sourcePatternId: string | null
  sessionDate: string // 'YYYY-MM-DD'
  startTime: string
  endTime: string
  capacity: number
  groupId: string | null
  status: 'scheduled' | 'cancelled'
  participantCount: number
}

export interface SessionParticipant {
  id: string
  sessionId: string
  childId: string
  childName: string
  status: 'enrolled' | 'removed'
}
