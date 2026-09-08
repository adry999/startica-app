import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'

type Client = SupabaseClient<Database>

export async function uploadKindergartenAvatar(
  client: Client,
  kindergartenId: string,
  file: File,
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const ext = file.name.split('.').pop()
    const filename = `${kindergartenId}.${ext}`

    const { error: uploadError } = await client.storage
      .from('kindergarten-avatars')
      .upload(filename, file, { upsert: true })

    if (uploadError) {
      return { success: false, error: uploadError.message }
    }

    const { data } = client.storage
      .from('kindergarten-avatars')
      .getPublicUrl(filename)

    return { success: true, url: data.publicUrl }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Upload failed' }
  }
}

export async function deleteKindergartenAvatar(
  client: Client,
  kindergartenId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: files } = await client.storage
      .from('kindergarten-avatars')
      .list('', { search: kindergartenId })

    if (files && files.length > 0) {
      const { error } = await client.storage
        .from('kindergarten-avatars')
        .remove(files.map(f => f.name))

      if (error) return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Delete failed' }
  }
}
