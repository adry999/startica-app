import { z } from 'zod'

export const createChildSchema = z.object({
  firstName:   z.string().min(1, 'required'),
  lastName:    z.string().min(1, 'required'),
  birthDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  bloodGroup:  z.string().nullable().optional(),
  allergies:   z.string().nullable().optional(),
  medicalNotes: z.string().nullable().optional(),
  nationalId:  z.string().nullable().optional(),
  idType:      z.enum(['CNP', 'IDNP']).nullable().optional(),
  groupId:     z.string().uuid().nullable().optional(),
  kindergartenId: z.string().uuid(),
  contractNumber: z.string().nullable().optional(),
  contractSignedAt: z.string().nullable().optional(),
  enrollmentStartDate: z.string().nullable().optional(),
})
export type CreateChildInput = z.infer<typeof createChildSchema>

export const updateChildSchema = z.object({
  firstName:   z.string().min(1).optional(),
  lastName:    z.string().min(1).optional(),
  birthDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bloodGroup:  z.string().nullable().optional(),
  allergies:   z.string().nullable().optional(),
  medicalNotes: z.string().nullable().optional(),
  nationalId:  z.string().nullable().optional(),
  idType:      z.enum(['CNP', 'IDNP']).nullable().optional(),
  groupId:     z.string().uuid().nullable().optional(),
  contractNumber: z.string().nullable().optional(),
  contractSignedAt: z.string().nullable().optional(),
  enrollmentStartDate: z.string().nullable().optional(),
})
export type UpdateChildInput = z.infer<typeof updateChildSchema>
