import { createSupabaseServerClient } from '~/core/supabase/client'

export default defineEventHandler(async (event) => {
  const childId = getRouterParam(event, 'id')
  if (!childId) throw createError({ statusCode: 400, statusMessage: 'Invalid child id' })

  const client = createSupabaseServerClient(event)
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { data: profile } = await client
    .from('users')
    .select('role')
    .eq('id', user.id)
    .is('deleted_at', null)
    .single()
  if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const [childResult, guardiansResult] = await Promise.all([
    client.from('children').select('*').eq('id', childId).is('deleted_at', null).single(),
    client.from('guardians').select('*').eq('child_id', childId).is('deleted_at', null),
  ])

  if (childResult.error || !childResult.data) {
    throw createError({ statusCode: 404, statusMessage: 'Child not found' })
  }
  if (guardiansResult.error) {
    throw createError({ statusCode: 500, statusMessage: 'Unable to export child data' })
  }

  return {
    exportedAt: new Date().toISOString(),
    child: childResult.data,
    guardians: guardiansResult.data ?? [],
  }
})
