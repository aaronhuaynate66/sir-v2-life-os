// SIR V2 — Slug generation + uniqueness para `people`.
//
// Slugs son la forma user-facing de las URLs /relaciones/[slug].
// Auto-generados desde el nombre, editables desde la UI del detail page.
//
// Reglas: lowercase, sin acentos, sin emojis, espacios -> '-',
// non-alphanum -> '-', collapse '-{2,}' -> '-', trim.
//
// La uniqueness es por (user_id, slug) — dos usuarios distintos pueden
// tener "diana-carolina"; un mismo usuario no.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

/** Caracter range alfanumerico ASCII tras normalizacion. */
const NON_ALPHANUM = /[^a-z0-9]+/g
const TRIM_DASH = /^-+|-+$/g
const COLLAPSE_DASH = /-{2,}/g

/**
 * Genera un slug desde un nombre arbitrario.
 *
 * Pasos:
 *   1. NFD normalize + strip diacritics (acentos -> letras planas).
 *   2. Lowercase.
 *   3. Reemplazar cualquier no-alfanumerico por '-'.
 *   4. Collapse '-{2,}' -> '-'.
 *   5. Trim de '-' inicial/final.
 *
 * Resultado siempre ASCII alfanumerico + guiones. Si la entrada queda
 * vacia (ej. solo emojis), retorna 'persona' como fallback.
 */
export function generateSlug(name: string): string {
  if (!name || typeof name !== 'string') return 'persona'
  const normalized = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .toLowerCase()
    .replace(NON_ALPHANUM, '-')
    .replace(COLLAPSE_DASH, '-')
    .replace(TRIM_DASH, '')
  return normalized || 'persona'
}

/**
 * Valida si un slug ya tiene el formato esperado. Util para inputs del
 * usuario en la UI de editar slug — si retorna false, mostrar error.
 *
 * Reglas: solo a-z, 0-9, '-'. No empieza ni termina en '-'. No tiene
 * '--' adyacente. Largo entre 1 y 80 chars.
 */
export function isValidSlug(slug: string): boolean {
  if (typeof slug !== 'string') return false
  if (slug.length < 1 || slug.length > 80) return false
  if (!/^[a-z0-9-]+$/.test(slug)) return false
  if (slug.startsWith('-') || slug.endsWith('-')) return false
  if (slug.includes('--')) return false
  return true
}

/**
 * Asegura uniqueness consultando contra Supabase. Si `base` ya existe
 * para el `userId`, prueba `base-2`, `base-3`, ... hasta encontrar uno
 * libre. Devuelve el slug final aprobado.
 *
 * Excepcion `excludeId`: cuando se renombra el slug de una persona
 * existente, NO contar su propio row como conflicto (sino siempre da
 * conflicto consigo mismo).
 */
export async function ensureUniqueSlug(
  base: string,
  userId: string,
  options: { excludeId?: string; client?: SupabaseClient } = {},
): Promise<string> {
  const { excludeId, client } = options
  const supabase = client ?? createClient()
  let candidate = base
  let suffix = 1
  // Loop bounded a 50 intentos para evitar bug infinito en edge cases.
  for (let i = 0; i < 50; i++) {
    let query = supabase
      .from('people')
      .select('id')
      .eq('user_id', userId)
      .eq('slug', candidate)
      .limit(1)
    if (excludeId) query = query.neq('id', excludeId)
    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) return candidate
    suffix += 1
    candidate = `${base}-${suffix}`
  }
  // Improbable: 50 colisiones consecutivas. Concatenamos timestamp para
  // garantizar resolucion en lugar de loopear infinito.
  return `${base}-${Date.now()}`
}
