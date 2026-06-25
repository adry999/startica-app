import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'

type Client = SupabaseClient<Database>
type UserRow = Database['public']['Tables']['users']['Row']

export type AuthResult<T> = { success: true; data: T } | { success: false; error: string }

export async function signInWithPassword(
  client: Client,
  email: string,
  password: string,
): Promise<AuthResult<{ userId: string }>> {
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    return { success: false, error: error?.message ?? 'unknown_error' }
  }
  return { success: true, data: { userId: data.user.id } }
}

export async function signOut(client: Client): Promise<AuthResult<null>> {
  const { error } = await client.auth.signOut()
  if (error) return { success: false, error: error.message }
  return { success: true, data: null }
}

export async function requestPasswordReset(
  client: Client,
  email: string,
  redirectTo: string,
): Promise<AuthResult<null>> {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) return { success: false, error: error.message }
  return { success: true, data: null }
}

export async function updatePassword(client: Client, password: string): Promise<AuthResult<null>> {
  const { error } = await client.auth.updateUser({ password })
  if (error) return { success: false, error: error.message }
  return { success: true, data: null }
}

export async function fetchCurrentUserProfile(client: Client, userId: string): Promise<AuthResult<UserRow>> {
  const { data, error } = await client.from('users').select('*').eq('id', userId).single()
  if (error || !data) return { success: false, error: error?.message ?? 'not_found' }
  return { success: true, data }
}

export async function getCurrentUserId(client: Client): Promise<string | null> {
  const { data } = await client.auth.getUser()
  return data.user?.id ?? null
}
