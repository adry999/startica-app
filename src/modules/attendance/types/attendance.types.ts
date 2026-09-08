export interface AttendanceRecord {
  id: string
  childId: string
  date: string
  status: 'present' | 'absent' | 'excused' | 'sick'
  markedBy: string
  notes: string | null
  childName?: string
}

export interface AttendanceSummary {
  date: string
  present: number
  absent: number
  excused: number
  sick: number
  total: number
}
