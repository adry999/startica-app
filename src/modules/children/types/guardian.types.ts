export type GuardianRelationship = 'mother' | 'father' | 'guardian' | 'other'

export interface Guardian {
  id: string
  childId: string
  kindergartenId: string
  firstName: string
  lastName: string
  fullName: string
  email: string | null
  phone: string | null
  relationship: GuardianRelationship
  isPrimary: boolean
  notes: string | null
}
