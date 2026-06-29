import { z } from 'zod'

export const createGroupSchema = z.object({
  name: z.string().min(1, 'required'),
  ageRange: z.string().nullable().optional(),
  educatorId: z.string().uuid().nullable().optional(),
  kindergartenId: z.string().uuid(),
  capacity: z.coerce.number().int().positive().nullable().optional(),
})
export type CreateGroupInput = z.infer<typeof createGroupSchema>

export const updateGroupSchema = z.object({
  name: z.string().min(1, 'required').optional(),
  ageRange: z.string().nullable().optional(),
  educatorId: z.string().uuid().nullable().optional(),
  capacity: z.coerce.number().int().positive().nullable().optional(),
})
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>
