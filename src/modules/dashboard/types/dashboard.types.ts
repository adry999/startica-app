export interface DashboardStats {
  totalChildren: number
  totalGroups: number
  activeStaff: number
}

export interface GroupSummary {
  id: string
  name: string
  ageRange: string | null
  capacity: number | null
  educatorName: string | null
}
