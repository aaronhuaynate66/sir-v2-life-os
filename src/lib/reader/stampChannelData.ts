// SIR V2 — "este canal SÍ trajo data": el sello de frescura por canal.
//
// ═══ POR QUÉ EXISTE, Y POR QUÉ ES UN ARCHIVO Y NO DOS LÍNEAS ══════════════════
//
// `reader_heartbeats.last_data_at` es la mitad ÚTIL del diagnóstico de silencio:
// el latido dice "la extensión está viva", este campo dice "y además está
// leyendo". La migración 0175 lo declaró diciendo "lo actualiza el endpoint de
// ingesta" — y lo actualizaba UNO solo (`lib/reader/persist.ts`, el camino de
// MENSAJES). El camino SOCIAL (`/api/social/ingest`, que es por donde entra todo
// Instagram y LinkedIn) nunca lo escribió.
//
// Consecuencia medida el 31-jul-2026: Instagram tenía **11 `social_profiles` y 17
// `social_page_followers` reales**, latía cada minuto con la extensión 0.9.0 —
// y su `last_data_at` estaba en **null**.
//
// ═══ EL BUG DE VERDAD ES AUTO-DERROTANTE ═════════════════════════════════════
//
// El brief no cantó "Instagram no trae nada" solo por CASUALIDAD: el fallback del
// cron mira `unmatched_social_activity`, que tenía 153 filas pendientes. Pero esa
// tabla es una BANDEJA — sus filas **se BORRAN al resolver la cuenta** (está
// documentado en `social/ingest`: por eso `social_profiles` existe aparte).
//
// O sea: la frescura de Instagram dependía de que quedaran cuentas SIN resolver,
// y el brief nocturno le pide a Aaron justamente resolverlas (30 por noche).
// **Mientras más hace lo que SIR le pide, más ciego queda el detector** — y al
// vaciar la bandeja habría dicho que Instagram nunca trajo nada, con la data ahí
// al lado. Es el mismo candado circular de #1027 (un detector no puede depender
// de la señal que solo produce su propio arreglo), y la misma regla de honestidad
// de cobertura de CLAUDE.md: no concluir "no existe" desde una vista parcial.
//
// Por eso vive acá y no inline: el contrato lo tienen que cumplir los DOS caminos
// de ingesta, y una copia por camino es exactamente cómo se separaron antes el
// hash de identidad (#1011) y los dos léxicos de organización (#1013).

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Marca que `channel` trajo datos reales AHORA.
 *
 * Es un UPDATE, no un upsert: si la fila no existe (extensión que nunca latió) no
 * hay que inventarla — una fila con latido nulo haría creer que el canal reportó
 * alguna vez. Best-effort y silencioso: perder el sello no puede tumbar una
 * ingesta que ya guardó los datos.
 *
 * `channel` es el mismo vocabulario que usa el latido ('whatsapp' | 'instagram' |
 * 'linkedin' | 'outlook'), que en el camino social coincide con `platform`.
 */
export async function stampChannelData(
  client: SupabaseClient,
  userId: string,
  channel: string,
): Promise<void> {
  if (!channel) return
  const nowIso = new Date().toISOString()
  try {
    await client.from('reader_heartbeats')
      .update({ last_data_at: nowIso, updated_at: nowIso })
      .eq('user_id', userId).eq('channel', channel)
  } catch { /* best-effort a propósito: ver arriba */ }
}
