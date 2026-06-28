import { describe, it, expect } from 'vitest'
import { inviteStaffSchema, updateStaffSchema } from './staff.schema'

describe('inviteStaffSchema', () => {
  it('accepts a valid invite payload', () => {
    const result = inviteStaffSchema.safeParse({
      email: 'ion.popescu@example.com',
      fullName: 'Ion Popescu',
      role: 'educator',
      kindergartenId: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid email', () => {
    const result = inviteStaffSchema.safeParse({
      email: 'not-an-email',
      fullName: 'Ion Popescu',
      role: 'educator',
      kindergartenId: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a full name shorter than 2 characters', () => {
    const result = inviteStaffSchema.safeParse({
      email: 'ion@example.com',
      fullName: 'I',
      role: 'educator',
      kindergartenId: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.success).toBe(false)
  })

  it('rejects role super_admin (not assignable via invite)', () => {
    const result = inviteStaffSchema.safeParse({
      email: 'ion@example.com',
      fullName: 'Ion Popescu',
      role: 'super_admin',
      kindergartenId: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-UUID kindergartenId', () => {
    const result = inviteStaffSchema.safeParse({
      email: 'ion@example.com',
      fullName: 'Ion Popescu',
      role: 'educator',
      kindergartenId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })
})

describe('updateStaffSchema', () => {
  it('accepts fullName without role', () => {
    const result = updateStaffSchema.safeParse({ fullName: 'Ion Popescu' })
    expect(result.success).toBe(true)
  })

  it('accepts fullName with role', () => {
    const result = updateStaffSchema.safeParse({ fullName: 'Ion Popescu', role: 'admin' })
    expect(result.success).toBe(true)
  })

  it('rejects short fullName', () => {
    const result = updateStaffSchema.safeParse({ fullName: 'I' })
    expect(result.success).toBe(false)
  })
})
