export type StaffMember = {
  id: string
  email: string
  fullName: string
  role: 'super_admin' | 'admin' | 'educator'
  status: 'active' | 'inactive'
  avatarUrl: string | null
  phone: string | null
  internalNote: string | null
}
