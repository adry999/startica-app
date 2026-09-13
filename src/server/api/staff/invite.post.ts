import { createSupabaseAdminClient, createSupabaseServerClient } from '~/core/supabase/client'
import { inviteStaffSchema } from '~/shared/schemas/staff.schema'
import { generatePassword } from '~/shared/utils/generatePassword'
import { updateGroup } from '~/modules/groups/services/groups.service'
import { grantModule } from '~/modules/staff/services/staff.service'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = inviteStaffSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }
  const { email, fullName, role, kindergartenId, mode, password, groupId, moduleKeys } = parsed.data
  const normalizedEmail = email.toLowerCase()

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

  // Admin callers may only invite educators — role escalation via invite is a
  // server-enforced rule, not just a UI constraint.
  if (callerProfile.role === 'admin' && role !== 'educator') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // A service-role client bypasses RLS, so validate the group explicitly before
  // creating an account or membership. This prevents an admin of one tenant
  // from assigning an educator to a group owned by another tenant.
  if (groupId && role === 'educator') {
    const { data: group, error: groupError } = await adminClient
      .from('groups')
      .select('id')
      .eq('id', groupId)
      .eq('kindergarten_id', kindergartenId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle()

    if (groupError || !group) {
      throw createError({ statusCode: 404, statusMessage: 'group_not_found' })
    }
  }

  const { data: existing } = await adminClient
    .from('users')
    .select('id, role')
    .eq('email', normalizedEmail)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing?.role === 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // S-I1: admin callers may only re-add users whose current role is educator.
  // (super_admin callers are unrestricted; the super_admin-target guard above handles that edge.)
  if (existing && callerProfile.role === 'admin' && existing.role !== 'educator') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  let userId: string
  let generatedPassword: string | null = null

  if (existing) {
    userId = existing.id
  } else if (mode === 'direct') {
    generatedPassword = password ?? generatePassword()

    const { data: createData, error: createUserError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    })
    if (createUserError || !createData.user) {
      console.error('[invite] createUser failed:', createUserError?.message)
      throw createError({ statusCode: 500, statusMessage: 'create_failed' })
    }
    userId = createData.user.id

    const { error: profileError } = await adminClient.from('users').insert({
      id: userId,
      email: normalizedEmail,
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

    const { error: userAuditError } = await adminClient.from('audit_logs').insert({
      user_id: caller.id,
      kindergarten_id: kindergartenId,
      action: 'create',
      entity: 'users',
      entity_id: userId,
    })
    if (userAuditError) {
      console.error('[invite] user audit log failed:', userAuditError.message)
    }
  } else {
    const siteUrl = useRuntimeConfig(event).public.siteUrl

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      normalizedEmail,
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
      email: normalizedEmail,
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

    // Audit: log the new user account creation explicitly.
    // write_audit_log trigger fires only when auth.uid() IS NOT NULL;
    // service-role context means auth.uid() IS NULL, so we log manually.
    const { error: userAuditError } = await adminClient.from('audit_logs').insert({
      user_id: caller.id,
      kindergarten_id: kindergartenId,
      action: 'create',
      entity: 'users',
      entity_id: userId,
    })
    if (userAuditError) {
      console.error('[invite] user audit log failed:', userAuditError.message)
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

  // Audit: write_audit_log trigger fires only for auth.uid() !== NULL;
  // the service-role context here means auth.uid() IS NULL, so we log explicitly.
  const { error: auditError } = await adminClient.from('audit_logs').insert({
    user_id: caller.id,
    kindergarten_id: kindergartenId,
    action: 'create',
    entity: 'user_kindergartens',
    entity_id: userId,
  })
  if (auditError) {
    console.error('[invite] audit log failed:', auditError.message)
  }

  if (groupId && role === 'educator') {
    // Keep this write in the caller's RLS context. The group was already
    // tenant-validated above and the policy also records the authenticated actor.
    const groupResult = await updateGroup(userClient, groupId, { educatorId: userId })
    if (!groupResult.success) {
      console.error('[invite] group assignment failed:', groupResult.error)
      throw createError({ statusCode: 500, statusMessage: 'group_assignment_failed' })
    }
  }

  if (moduleKeys?.length) {
    for (const key of moduleKeys) {
      const grantResult = await grantModule(adminClient, userId, kindergartenId, key, caller.id)
      if (!grantResult.success) {
        console.error('[invite] module grant failed:', key, grantResult.error)
      }
    }
  }

  return { success: true, ...(generatedPassword ? { generatedPassword } : {}) }
})
