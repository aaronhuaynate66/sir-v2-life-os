// SIR V2 — logEvent: tagging liviano de interacciones/eventos a la tabla `events`.
//
// Fail-open TOTAL: loguear un evento NUNCA debe romper ni demorar de forma
// observable el request que lo emite (por eso el try/catch traga todo). Complementa
// reportApiError (Sentry, excepciones inesperadas) con EVENTOS de negocio: qué
// acción se disparó, si salió ok, cuánto tardó y su contexto. Mig 0130.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface EventInput {
  /** Tipo de evento, ej. 'rehearse' | 'derive' | 'capture'. */
  type: string
  /** true = éxito, false = fallo, undefined = info. */
  ok?: boolean
  /** Ruta o superficie que lo emitió. */
  route?: string
  /** Latencia en ms, si aplica. */
  durationMs?: number
  /** Contexto libre (personId, stage, error recortado, etc.). */
  meta?: Record<string, unknown>
}

export async function logEvent(client: SupabaseClient, userId: string, e: EventInput): Promise<void> {
  try {
    await client.from('events').insert({
      user_id: userId,
      type: e.type.slice(0, 80),
      ok: e.ok ?? null,
      route: e.route ?? null,
      duration_ms: typeof e.durationMs === 'number' ? Math.round(e.durationMs) : null,
      meta: e.meta ?? {},
    })
  } catch {
    // Fail-open: la telemetría jamás rompe el request.
  }
}
