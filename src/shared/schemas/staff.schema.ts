import { z } from 'zod'

export const inviteStaffSchema = z.object({
  email: z.email(),
  fullName: z.string().min(2),
  role: z.enum(['admin', 'educator']),
  kindergartenId: z.string().uuid(),
})

export const updateStaffSchema = z.object({
  fullName: z.string().min(2),
  // super_admin is excluded: that role can only be granted via seed SQL (V1 bootstrap).
  // The DB trigger enforces this at the DB level too.
  role: z.enum(['admin', 'educator']).optional(),
})

export type InviteStaffInput = z.infer<typeof inviteStaffSchema>
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>
