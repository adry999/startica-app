import { z } from 'zod'

export const trainerAvailabilitySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .refine(d => d.startTime < d.endTime, { message: 'startTime must be before endTime', path: ['endTime'] })

export const schedulePatternSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    defaultGroupId: z.string().uuid().nullable().optional(),
    // coerce: UInput type="number" emits string values (same as groups.schema)
    capacity: z.coerce.number().int().min(1),
    activeFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    activeUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .refine(d => d.startTime < d.endTime, { message: 'startTime must be before endTime', path: ['endTime'] })

export type TrainerAvailabilityInput = z.infer<typeof trainerAvailabilitySchema>
export type SchedulePatternInput = z.infer<typeof schedulePatternSchema>
