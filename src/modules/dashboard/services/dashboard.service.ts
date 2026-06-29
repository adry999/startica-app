import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { DashboardStats, GroupSummary, ActivityEntry, StaffDuty } from '../types/dashboard.types'
import { STAFF_EXCLUDED_ROLES } from '~/shared/utils/staffFilters'

type Client = SupabaseClient<Database>

export async function fetchStats(
  client: Client,
  kindergartenId: string,
): Promise<Result<DashboardStats>> {
  const isAll = kindergartenId === 'ALL'

  const childrenQuery = client
    .from('children')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('status', 'enrolled')

  const groupsQuery = client
    .from('groups')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('status', 'active')

  const staffQuery = isAll
    ? client
        .from('users')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'active')
        .neq('role', STAFF_EXCLUDED_ROLES[0])
    : client
        .from('users')
        .select('id, user_kindergartens!inner(kindergarten_id)', { count: 'exact', head: true })
        .eq('user_kindergartens.kindergarten_id', kindergartenId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .neq('role', STAFF_EXCLUDED_ROLES[0])

  if (!isAll) {
    childrenQuery.eq('kindergarten_id', kindergartenId)
    groupsQuery.eq('kindergarten_id', kindergartenId)
  }

  const [childrenRes, groupsRes, staffRes] = await Promise.all([childrenQuery, groupsQuery, staffQuery])

  if (childrenRes.error) return { success: false, error: childrenRes.error.message }
  if (groupsRes.error) return { success: false, error: groupsRes.error.message }
  if (staffRes.error) return { success: false, error: staffRes.error.message }

  return {
    success: true,
    data: {
      totalChildren: childrenRes.count ?? 0,
      totalGroups: groupsRes.count ?? 0,
      activeStaff: staffRes.count ?? 0,
    },
  }
}

export async function fetchActiveGroups(
  client: Client,
  kindergartenId: string,
): Promise<Result<GroupSummary[]>> {
  const isAll = kindergartenId === 'ALL'

  const groupsQuery = client
    .from('groups')
    .select('id, name, age_range, users!educator_id(full_name)')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('name')
    .limit(8)

  const childrenQuery = client
    .from('children')
    .select('group_id', { count: 'exact' })
    .eq('status', 'enrolled')
    .is('deleted_at', null)
    .not('group_id', 'is', null)

  if (!isAll) {
    groupsQuery.eq('kindergarten_id', kindergartenId)
    childrenQuery.eq('kindergarten_id', kindergartenId)
  }

  const [groupsRes, childrenRes] = await Promise.all([groupsQuery, childrenQuery])

  if (groupsRes.error) return { success: false, error: groupsRes.error.message }
  if (childrenRes.error) return { success: false, error: childrenRes.error.message }

  // Count children per group in JS
  const countMap = new Map<string, number>()
  for (const row of childrenRes.data ?? []) {
    if (row.group_id) countMap.set(row.group_id, (countMap.get(row.group_id) ?? 0) + 1)
  }

  return {
    success: true,
    data: (groupsRes.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      ageRange: row.age_range ?? null,
      childrenCount: countMap.get(row.id) ?? 0,
      educatorName: (row.users as { full_name: string } | null)?.full_name ?? null,
    })),
  }
}

export async function fetchRecentActivity(
  client: Client,
  kindergartenId: string,
): Promise<Result<ActivityEntry[]>> {
  const query = client
    .from('audit_logs')
    .select('id, action, entity, entity_id, created_at, users!audit_logs_user_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(8)

  if (kindergartenId !== 'ALL') {
    query.eq('kindergarten_id', kindergartenId)
  }

  const { data, error } = await query

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id ?? null,
      createdAt: row.created_at,
      userName: (row.users as { full_name: string } | null)?.full_name ?? '—',
    })),
  }
}

export async function fetchStaffOnDuty(
  client: Client,
  kindergartenId: string,
): Promise<Result<StaffDuty[]>> {
  if (kindergartenId === 'ALL') return { success: true, data: [] }

  const { data, error } = await client
    .from('users')
    .select('id, full_name, role, user_kindergartens!inner(kindergarten_id)')
    .eq('user_kindergartens.kindergarten_id', kindergartenId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .neq('role', STAFF_EXCLUDED_ROLES[0])
    .order('full_name')
    .limit(5)

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      role: row.role,
    })),
  }
}
