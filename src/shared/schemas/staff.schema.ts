import { z } from 'zod'

const moduleKeySchema = z.enum(['pool', 'payroll_own', 'payroll_all'])

export const inviteStaffSchema = z.object({
  email: z.email(),
  fullName: z.string().min(2),
  role: z.enum(['admin', 'educator']),
  kindergartenId: z.string().uuid(),
  // 'direct' (default): admin sets the password now, no email is sent.
  // 'invite': existing set-password-link email flow.
  mode: z.enum(['direct', 'invite']).default('direct'),
  // Only used in 'direct' mode. Omit to let the server generate one.
  password: z.string().min(8).optional(),
  // Only meaningful when role === 'educator'.
  groupId: z.string().uuid().optional(),
  moduleKeys: z.array(moduleKeySchema).optional(),
})

export const updateStaffSchema = z.object({
  fullName: z.string().min(2),
  // super_admin is excluded: that role can only be granted via seed SQL (V1 bootstrap).
  // The DB trigger enforces this at the DB level too.
  role: z.enum(['admin', 'educator']).optional(),
  phone: z.string().max(30).optional().or(z.literal('')),
  internalNote: z.string().max(2000).optional().or(z.literal('')),
})

export type InviteStaffInput = z.input<typeof inviteStaffSchema>
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>
