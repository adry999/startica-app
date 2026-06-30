export interface DashboardStats {
  totalChildren: number
  totalGroups: number
  activeStaff: number
}

export interface GroupSummary {
  id: string
  name: string
  ageRange: string | null
  childrenCount: number
  educatorName: string | null
}

export interface ActivityEntry {
  id: string
  action: string
  entity: string
  entityId: string | null
  createdAt: string
  userName: string
}

export interface StaffDuty {
  id: string
  fullName: string
  role: string
}
