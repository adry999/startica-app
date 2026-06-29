import { z } from 'zod'

const RELATIONSHIPS = ['mother', 'father', 'guardian', 'other'] as const

export const createGuardianSchema = z.object({
  childId: z.string().uuid(),
  firstName: z.string().min(1, 'required'),
  lastName: z.string().min(1, 'required'),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  relationship: z.enum(RELATIONSHIPS),
  isPrimary: z.boolean().default(false),
  notes: z.string().nullable().optional(),
})
export type CreateGuardianInput = z.infer<typeof createGuardianSchema>

export const updateGuardianSchema = z.object({
  firstName: z.string().min(1, 'required').optional(),
  lastName: z.string().min(1, 'required').optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  relationship: z.enum(RELATIONSHIPS).optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().nullable().optional(),
})
export type UpdateGuardianInput = z.infer<typeof updateGuardianSchema>
