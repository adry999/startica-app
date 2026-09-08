import { createSupabaseServerClient } from '~/core/supabase/client'

export default defineEventHandler(async (event) => {
  const childId = getRouterParam(event, 'id')
  const body = await readBody<{ confirmation?: string }>(event)
  if (!childId || body?.confirmation !== 'ANONYMIZE') {
    throw createError({ statusCode: 400, statusMessage: 'Explicit anonymization confirmation is required' })
  }

  const client = createSupabaseServerClient(event)
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { error } = await client.rpc('anonymize_child', { p_child_id: childId })
  if (error?.code === '42501') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  if (error?.code === 'P0002') throw createError({ statusCode: 404, statusMessage: 'Child not found' })
  if (error) throw createError({ statusCode: 500, statusMessage: 'Unable to anonymize child data' })

  return { success: true }
})
