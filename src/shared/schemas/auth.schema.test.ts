import { describe, it, expect } from 'vitest'
import { loginSchema, requestPasswordResetSchema, updatePasswordSchema } from './auth.schema'

describe('loginSchema', () => {
  it('accepts a valid email and non-empty password', () => {
    const result = loginSchema.safeParse({ email: 'admin@startica.dev', password: 'Startica123!' })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'Startica123!' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({ email: 'admin@startica.dev', password: '' })
    expect(result.success).toBe(false)
  })
})

describe('requestPasswordResetSchema', () => {
  it('accepts a valid email', () => {
    expect(requestPasswordResetSchema.safeParse({ email: 'admin@startica.dev' }).success).toBe(true)
  })

  it('rejects an invalid email', () => {
    expect(requestPasswordResetSchema.safeParse({ email: 'nope' }).success).toBe(false)
  })
})

describe('updatePasswordSchema', () => {
  it('accepts matching passwords of valid length', () => {
    const result = updatePasswordSchema.safeParse({ password: 'newpass1', confirmPassword: 'newpass1' })
    expect(result.success).toBe(true)
  })

  it('rejects mismatched passwords', () => {
    const result = updatePasswordSchema.safeParse({ password: 'newpass1', confirmPassword: 'different' })
    expect(result.success).toBe(false)
  })

  it('rejects passwords shorter than 6 characters', () => {
    const result = updatePasswordSchema.safeParse({ password: 'abc', confirmPassword: 'abc' })
    expect(result.success).toBe(false)
  })
})
