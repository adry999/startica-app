export interface ChildGuardianSummary {
  fullName: string
  phone: string | null
  email: string | null
  relationship: string
}

export interface Child {
  id: string
  firstName: string
  lastName: string
  fullName: string
  birthDate: string
  age: number
  bloodGroup: string | null
  allergies: string | null
  medicalNotes: string | null
  nationalId: string | null
  idType: 'CNP' | 'IDNP' | null
  status: 'enrolled' | 'withdrawn' | 'graduated'
  groupId: string | null
  groupName: string | null
  kindergartenId: string
  primaryGuardian: ChildGuardianSummary | null
}
