import { z } from 'zod'

export const kindergartenDetailsSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
})

export const kindergartenSettingsSchema = z.object({
  timezone: z.string().min(1),
  defaultLocale: z.enum(['ro', 'en']),
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
})

export type KindergartenDetailsInput = z.infer<typeof kindergartenDetailsSchema>
export type KindergartenSettingsInput = z.infer<typeof kindergartenSettingsSchema>
