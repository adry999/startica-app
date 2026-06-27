import type { SupabaseClient } from '@supabase/supabase-js'
import type { DashboardStats, GroupSummary } from '../types/dashboard.types'

type Result<T> = { success: true; data: T } | { success: false; error: string }

export async function fetchStats(
  client: SupabaseClient,
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

  // Staff count: per-kg use user_kindergartens; for ALL use users table directly
  const staffQuery = isAll
    ? client
        .from('users')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'active')
        .neq('role', 'super_admin')
    : client
        .from('user_kindergartens')
        .select('user_id', { count: 'exact', head: true })
        .eq('kindergarten_id', kindergartenId)

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
  client: SupabaseClient,
  kindergartenId: string,
): Promise<Result<GroupSummary[]>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = client
    .from('groups')
    .select('id, name, age_range, users!educator_id(full_name)')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('name')
    .limit(10)

  if (kindergartenId !== 'ALL') {
    q = q.eq('kindergarten_id', kindergartenId)
  }

  const { data, error } = await q

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      name: row.name as string,
      ageRange: (row.age_range as string | null) ?? null,
      capacity: null, // capacity column does not exist in the current DB schema
      educatorName: (row.users as { full_name: string } | null)?.full_name ?? null,
    })),
  }
}
