import { describe, expect, it } from 'vitest'
import {
  argumentsOf,
  createSupabaseClientFake,
  networkFailureResponse,
  successResponse,
} from '@test-support/supabase-client-fake'
import { updateKindergartenLogo } from './settings.service'

const kindergartenId = '3f1a9c2e-5b7d-4e8a-9c1f-2a4b6d8e0f13'
const actorId = 'user-1'
const logoUrl = 'https://cdn.example/kindergarten-avatars/logo.png'

describe('updateKindergartenLogo', () => {
  it('writes only the logo url and the actor for the kindergarten', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse({ id: kindergartenId }))

    const result = await updateKindergartenLogo(client, kindergartenId, actorId, logoUrl)

    expect(result).toEqual({ success: true, data: undefined })
    const kindergartensQuery = queries.find(query => query.target === 'kindergartens')
    expect(argumentsOf(kindergartensQuery, 'update')).toEqual([[{ logo_url: logoUrl, updated_by: actorId }]])
    expect(argumentsOf(kindergartensQuery, 'eq')).toEqual([['id', kindergartenId]])
  })

  it('reports a refusal when row-level security leaves no row to update', async () => {
    const { client } = createSupabaseClientFake(() => successResponse(null))

    const result = await updateKindergartenLogo(client, kindergartenId, actorId, logoUrl)

    expect(result).toEqual({ success: false, error: 'forbidden' })
  })

  it('reports a failure when the request does not reach the server', async () => {
    const { client } = createSupabaseClientFake(() => networkFailureResponse)

    const result = await updateKindergartenLogo(client, kindergartenId, actorId, logoUrl)

    expect(result.success).toBe(false)
  })
})
