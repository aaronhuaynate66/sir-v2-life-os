'use client'
// SIR V2 — subida de avatar (client-side al bucket privado person-avatars) +
// registro vía /api/avatars. Mismo patrón que notas de voz.
import { createClient } from '@/lib/supabase/client'

function extForType(t: string): string {
  if (t.includes('png')) return 'png'
  if (t.includes('webp')) return 'webp'
  if (t.includes('gif')) return 'gif'
  return 'jpg'
}

/** Sube la foto y registra el avatar. Devuelve la signed URL (o null). */
export async function uploadAvatar(personId: string, file: File): Promise<string | null> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) throw new Error('Sesión expirada')
  const path = `${userId}/${personId}.${extForType(file.type || 'image/jpeg')}`
  const { error: upErr } = await supabase.storage.from('person-avatars').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
  if (upErr) throw new Error(upErr.message)
  const res = await fetch('/api/avatars', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ person_id: personId, storage_path: path }) })
  if (!res.ok) throw new Error('No se pudo registrar el avatar')
  const j = (await res.json()) as { url?: string | null }
  return j.url ?? null
}

export async function fetchAvatars(): Promise<Record<string, string>> {
  try {
    const res = await fetch('/api/avatars')
    if (!res.ok) return {}
    const j = (await res.json()) as { avatars?: Record<string, string> }
    return j.avatars ?? {}
  } catch { return {} }
}

export async function deleteAvatar(personId: string): Promise<void> {
  try { await fetch(`/api/avatars?person_id=${encodeURIComponent(personId)}`, { method: 'DELETE' }) } catch { /* */ }
}
