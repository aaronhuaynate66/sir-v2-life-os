// SIR V2 — snapshot del avatar capturado (bandeja ¿quién es quién?).
//
// La URL de avatar viene del CDN de Instagram: caduca en horas/días y bloquea
// hotlinking. Para que la cara siga visible en la bandeja (y sirva de referencia
// al match por cara), la BAJAMOS y la subimos al bucket privado person-avatars.
// Devuelve el storage_path permanente, o null si algo falla (fail-soft: la UI
// cae a la URL cruda mientras tanto).

import type { SupabaseClient } from '@supabase/supabase-js'

export const UNMATCHED_AVATAR_BUCKET = 'person-avatars'

/** Tope de tamaño: los avatares de IG son thumbnails de pocos KB. Cortamos en 2MB
 *  por si acaso (defensa contra una URL que no sea la foto). */
const MAX_BYTES = 2_000_000
const FETCH_TIMEOUT_MS = 5_000

function extFromContentType(ct: string | null): string {
  const t = (ct ?? '').toLowerCase()
  if (t.includes('png')) return 'png'
  if (t.includes('webp')) return 'webp'
  if (t.includes('gif')) return 'gif'
  return 'jpg'
}

/** Path del snapshot de un item no-asignado (bajo la carpeta del dueño). */
export function unmatchedAvatarPath(userId: string, unmatchedId: string, ext = 'jpg'): string {
  return `${userId}/unmatched/${unmatchedId}.${ext}`
}

/**
 * Baja el avatar de `avatarUrl` y lo sube al bucket. Devuelve el path o null.
 * `admin` debe ser un cliente service-role (bypassa RLS del storage).
 */
export async function snapshotUnmatchedAvatar(
  admin: SupabaseClient,
  userId: string,
  unmatchedId: string,
  avatarUrl: string,
): Promise<string | null> {
  if (!avatarUrl || !/^https?:\/\//i.test(avatarUrl)) return null
  let bytes: Uint8Array
  let contentType: string | null
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const res = await fetch(avatarUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SIR/1.0)' },
    }).finally(() => clearTimeout(t))
    if (!res.ok) return null
    contentType = res.headers.get('content-type')
    if (contentType && !contentType.toLowerCase().startsWith('image/')) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null
    bytes = buf
  } catch {
    return null
  }
  const ext = extFromContentType(contentType)
  const path = unmatchedAvatarPath(userId, unmatchedId, ext)
  try {
    const { error } = await admin.storage
      .from(UNMATCHED_AVATAR_BUCKET)
      .upload(path, bytes, { contentType: contentType ?? 'image/jpeg', upsert: true })
    if (error) return null
    return path
  } catch {
    return null
  }
}
