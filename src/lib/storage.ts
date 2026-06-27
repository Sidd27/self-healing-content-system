import { createClient } from '@supabase/supabase-js'

// Secret key (was: service_role) — server-side only, bypasses RLS
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
)

const BUCKET = 'source-files'

export async function uploadSourceFile(
  sourceId: string,
  file: File
): Promise<{ url: string; path: string }> {
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${sourceId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, path }
}
