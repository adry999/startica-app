import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export const requestPasswordResetSchema = z.object({
  email: z.email(),
})

export const updatePasswordSchema = z
  .object({
    password: z.string().min(6),
    confirmPassword: z.string().min(6),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'passwordMismatch',
    path: ['confirmPassword'],
  })

export type LoginInput = z.infer<typeof loginSchema>
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>
