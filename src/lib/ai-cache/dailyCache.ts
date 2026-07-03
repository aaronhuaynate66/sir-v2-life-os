// SIR V2 — Cache diaria de respuestas IA (V2 del plan).
//
// Helper fail-open sobre la tabla ai_daily_cache (mig 0120). Cachea la respuesta
// de un endpoint IA por (user, kind, cache_key) para que repetir la misma acción
// el mismo día no dispare otra llamada Sonnet. Mismo espíritu que el cache de
// daily_briefs, pero genérico: cada consumidor elige su `kind` y su `cache_key`.
//
//   - reasoner  → kind='reason',   key = día en Lima (una lectura por día).
//   - decisión  → kind='decision', key = día + hash del texto (misma decisión
//                 el mismo día = cacheada; decisiones distintas no chocan).
//
// TODO lo de red es try/catch: si la tabla 0120 no está aplicada aún, las
// lecturas devuelven null y las escrituras se tragan el error → el endpoint
// genera on-demand igual. Nunca rompe la respuesta al usuario.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Hash corto y determinístico (FNV-1a de 32 bits, base36) de un texto ya
 * normalizado. NO es criptográfico — sólo para dar una `cache_key` estable por
 * contenido. Sin Date.now()/random → seguro en tests y en el runtime de workflows.
 */
export function shortHash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    // Multiplicación FNV con enteros de 32 bits (evita perder precisión).
    h = Math.imul(h, 0x01000193)
  }
  // >>> 0 lo vuelve unsigned; base36 lo compacta.
  return (h >>> 0).toString(36)
}

/** Normaliza el texto de una decisión para que variaciones triviales (espacios,
 *  mayúsculas) compartan cache. */
export function normalizeForKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** cache_key de una decisión: día + hash del (título + descripción) normalizado. */
export function decisionCacheKey(dayKey: string, title: string, description: string): string {
  return `${dayKey}:${shortHash(normalizeForKey(`${title}\n${description}`))}`
}

/**
 * Lee el payload cacheado. Devuelve null si no hay fila, si la tabla no existe
 * (0120 sin aplicar) o ante cualquier error → el caller genera on-demand.
 */
export async function readDailyCache<T>(
  supabase: SupabaseClient,
  userId: string,
  kind: string,
  cacheKey: string,
): Promise<T | null> {
  try {
    const { data } = await supabase
      .from('ai_daily_cache')
      .select('payload')
      .eq('user_id', userId)
      .eq('kind', kind)
      .eq('cache_key', cacheKey)
      .maybeSingle()
    if (data && data.payload && typeof data.payload === 'object') {
      return data.payload as T
    }
  } catch {
    /* tabla no aplicada / error de red → sin cache */
  }
  return null
}

/**
 * Escribe (upsert idempotente por user+kind+cache_key). Fail-open: si falla, ya
 * devolvimos la respuesta generada igual, así que sólo se pierde el cache.
 */
export async function writeDailyCache(
  supabase: SupabaseClient,
  userId: string,
  kind: string,
  cacheKey: string,
  payload: unknown,
): Promise<void> {
  try {
    await supabase.from('ai_daily_cache').upsert(
      {
        user_id: userId,
        kind,
        cache_key: cacheKey,
        payload: payload as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,kind,cache_key' },
    )
  } catch {
    /* sin cache, ya respondimos */
  }
}
