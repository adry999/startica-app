import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { ModuleGrant, ModuleKey } from '../types/moduleAccess.types'

type Client = SupabaseClient<Database>

export async function listUserModuleGrants(
  client: Client,
  userId: string,
): Promise<Result<ModuleGrant[]>> {
  const { data, error } = await client
    .from('user_modules')
    .select('kindergarten_id, module_key')
    .eq('user_id', userId)
    .is('deleted_at', null)

  if (error || !data) return { success: false, error: error?.message ?? 'list_failed' }
  return {
    success: true,
    data: data.map((row) => ({
      kindergartenId: row.kindergarten_id,
      moduleKey: row.module_key as ModuleKey,
    })),
  }
}
