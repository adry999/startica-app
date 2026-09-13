import { describe, expect, it, vi } from 'vitest'
import { createChild } from './children.service'

const row = {
  id: 'child-1', first_name: 'Ana', last_name: 'Popescu', birth_date: '2021-05-12',
  blood_group: null, allergies: null, medical_notes: null, national_id: null, id_type: null,
  status: 'enrolled', group_id: null, kindergarten_id: 'kg-1', groups: null, guardians: [],
  contract_number: 'KG-2026-001', contract_signed_at: '2026-09-01', enrollment_start_date: '2026-09-15',
}

function mockClient() {
  const single = vi.fn().mockResolvedValue({ data: row, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select })
  return {
    client: { from: vi.fn().mockReturnValue({ insert }) } as never,
    insert,
  }
}

describe('createChild', () => {
  it('persists supplied contract fields in the child insert payload', async () => {
    const { client, insert } = mockClient()

    const result = await createChild(client, {
      firstName: 'Ana', lastName: 'Popescu', birthDate: '2021-05-12', kindergartenId: 'kg-1',
      contractNumber: 'KG-2026-001', contractSignedAt: '2026-09-01', enrollmentStartDate: '2026-09-15',
    })

    expect(result.success).toBe(true)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      contract_number: 'KG-2026-001',
      contract_signed_at: '2026-09-01',
      enrollment_start_date: '2026-09-15',
    }))
  })

  it('uses null for omitted optional contract fields', async () => {
    const { client, insert } = mockClient()

    await createChild(client, {
      firstName: 'Ana', lastName: 'Popescu', birthDate: '2021-05-12', kindergartenId: 'kg-1',
    })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      contract_number: null,
      contract_signed_at: null,
      enrollment_start_date: null,
    }))
  })
})
