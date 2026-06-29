export interface Group {
  id: string
  name: string
  ageRange: string | null
  educatorId: string | null
  educatorName: string | null
  status: 'active' | 'archived'
  kindergartenId: string
  capacity: number | null
  childrenCount: number
}
