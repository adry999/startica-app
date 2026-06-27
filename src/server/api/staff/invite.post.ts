import { createSupabaseAdminClient, createSupabaseServerClient } from '~/core/supabase/client'
import { inviteStaffSchema } from '~/shared/schemas/staff.schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = inviteStaffSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }
  const { email, fullName, role, kindergartenId } = parsed.data

  const userClient = createSupabaseServerClient(event)
  const { data: { user: caller } } = await userClient.auth.getUser()
  if (!caller) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const adminClient = createSupabaseAdminClient()
  const { data: callerProfile } = await adminClient
    .from('users')
    .select('role, status, deleted_at')
    .eq('id', caller.id)
    .is('deleted_at', null)
    .single()

  if (
    !callerProfile
    || !['super_admin', 'admin'].includes(callerProfile.role)
    || callerProfile.status !== 'active'
  ) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  if (callerProfile.role === 'admin') {
    const { data: membership } = await adminClient
      .from('user_kindergartens')
      .select('user_id')
      .eq('user_id', caller.id)
      .eq('kindergarten_id', kindergartenId)
      .single()
    if (!membership) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
  }

  const { data: existing } = await adminClient
    .from('users')
    .select('id, role')
    .eq('email', email)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing?.role === 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  let userId: string

  if (existing) {
    userId = existing.id
  } else {
    const siteUrl = useRuntimeConfig(event).public.siteUrl

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: { full_name: fullName, role },
        redirectTo: `${siteUrl}/accept-invite`,
      },
    )
    if (inviteError || !inviteData.user) {
      console.error('[invite] inviteUserByEmail failed:', inviteError?.message)
      throw createError({ statusCode: 500, statusMessage: 'invite_failed' })
    }
    userId = inviteData.user.id

    const { error: profileError } = await adminClient.from('users').insert({
      id: userId,
      email,
      full_name: fullName,
      role,
      status: 'active',
      created_by: caller.id,
      updated_by: caller.id,
    })
    if (profileError) {
      console.error('[invite] profile insert failed:', profileError.message)
      throw createError({ statusCode: 500, statusMessage: 'profile_insert_failed' })
    }
  }

  const { error: memberError } = await adminClient
    .from('user_kindergartens')
    .upsert(
      { user_id: userId, kindergarten_id: kindergartenId, created_by: caller.id },
      { onConflict: 'user_id,kindergarten_id' },
    )
  if (memberError) {
    console.error('[invite] membership upsert failed:', memberError.message)
    throw createError({ statusCode: 500, statusMessage: 'membership_failed' })
  }

  return { success: true }
})
