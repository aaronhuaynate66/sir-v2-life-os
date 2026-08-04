// SIR V2 — La última data REAL por canal del reader. UNA sola fuente de verdad.
//
// ═══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
//
// `reader_heartbeats.last_data_at` NO alcanza: la migración 0175 dice que "lo
// actualiza el endpoint de ingesta" y por un tiempo nadie lo escribía, así que
// hay filas viejas en null con datos reales al lado. La verdad de campo está en
// las tablas donde el dato ATERRIZA.
//
// Y hay una trampa específica con Instagram, que ya costó un diagnóstico falso:
// `unmatched_social_activity` es una BANDEJA y sus filas se BORRAN al resolver la
// cuenta. Apoyar la frescura de Instagram solo en ella la hacía depender de que
// quedaran cuentas SIN resolver — y el brief nocturno le pide a Aaron resolver 30
// por noche. O sea: mientras más hacía lo que SIR le pedía, más ciego quedaba el
// detector. `social_profiles` y `social_page_followers` SOBREVIVEN a la
// resolución, así que son la señal honesta.
//
// ═══ Y POR QUÉ ES UN MÓDULO Y NO CÓDIGO EN LA RUTA ══════════════════════════
//
// Esto vivía dentro de `cron/morning-push`. Al construir el panel de estado de
// `/reader` (4-ago-2026) el panel leyó solo `reader_heartbeats` y quedó diciendo
// "Instagram NUNCA trajo nada" mientras el brief decía "hace 4 días que no trae
// nada" — con la misma base de datos, el mismo día. Dos fuentes de verdad para la
// misma pregunta es exactamente el problema que el panel venía a resolver.
//
// Si mañana se agrega una fuente (Teams, LinkedIn), se agrega ACÁ y las dos
// superficies se enteran juntas.

/** Lo mínimo que se necesita de un cliente de Supabase para esto. */
export interface ClienteMinimo {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): {
          order(col: string, o: { ascending: boolean }): { limit(n: number): Promise<{ data: unknown }> }
        }
        not(col: string, op: string, val: null): {
          order(col: string, o: { ascending: boolean }): { limit(n: number): Promise<{ data: unknown }> }
        }
        order(col: string, o: { ascending: boolean }): { limit(n: number): Promise<{ data: unknown }> }
        limit(n: number): Promise<{ data: unknown }>
      }
    }
  }
}

/** De varias fechas, la MÁS RECIENTE. Cada fuente ve un pedazo distinto de lo que
 *  trajo el canal, y quedarse con la más vieja subdiagnosticaría. PURA. */
export function masReciente(...isos: Array<string | null | undefined>): string | null {
  let mejor: string | null = null
  for (const iso of isos) {
    if (!iso) continue
    const t = Date.parse(iso)
    if (!Number.isFinite(t)) continue
    if (mejor === null || t > Date.parse(mejor)) mejor = iso
  }
  return mejor
}

function primero(data: unknown, campo: string): string | null {
  const arr = Array.isArray(data) ? data : []
  const row = arr[0] as Record<string, unknown> | undefined
  const v = row?.[campo]
  return typeof v === 'string' ? v : null
}

/**
 * Última data real por canal, mirando dónde el dato ATERRIZA (no la tabla de
 * latidos). Fail-soft por fuente: si una consulta falla, las otras siguen
 * valiendo — es mejor un diagnóstico con 2 de 3 fuentes que ninguno.
 */
export async function ultimaDataPorCanal(
  db: ClienteMinimo,
  userId: string,
): Promise<Record<string, string | null>> {
  const safe = async (fn: () => Promise<{ data: unknown }>): Promise<unknown> => {
    try { return (await fn()).data } catch { return null }
  }

  const [msg, ig, perfil, seguidor] = await Promise.all([
    safe(() => db.from('chat_messages').select('sent_at')
      .eq('user_id', userId).eq('source', 'reader')
      .order('sent_at', { ascending: false }).limit(1)),
    safe(() => db.from('unmatched_social_activity').select('observed_at')
      .eq('user_id', userId).eq('platform', 'instagram')
      .order('observed_at', { ascending: false }).limit(1)),
    safe(() => db.from('social_profiles').select('captured_at')
      .eq('user_id', userId).eq('platform', 'instagram')
      .order('captured_at', { ascending: false }).limit(1)),
    safe(() => db.from('social_page_followers').select('observed_at')
      .eq('user_id', userId).eq('source', 'instagram')
      .order('observed_at', { ascending: false }).limit(1)),
  ])

  return {
    whatsapp: primero(msg, 'sent_at'),
    instagram: masReciente(
      primero(ig, 'observed_at'),
      primero(perfil, 'captured_at'),
      primero(seguidor, 'observed_at'),
    ),
  }
}
