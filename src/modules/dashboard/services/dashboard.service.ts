import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { DashboardStats, GroupSummary } from '../types/dashboard.types'
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

  // Staff count: active users only, excluding super_admin (platform-level, not kindergarten staff)
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
  const baseQuery = client
    .from('groups')
    .select('id, name, age_range, users!educator_id(full_name)')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('name')
    .limit(10)

  const { data, error } = await (kindergartenId !== 'ALL'
    ? baseQuery.eq('kindergarten_id', kindergartenId)
    : baseQuery)

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      ageRange: row.age_range ?? null,
      capacity: null, // capacity column does not exist in the current DB schema
      educatorName: (row.users as { full_name: string } | null)?.full_name ?? null,
    })),
  }
}
