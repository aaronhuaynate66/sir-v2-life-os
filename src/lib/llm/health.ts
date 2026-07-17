// SIR V2 — Puente entre la telemetría (ai_usage) y el router (ADR 0011).
//
// Lee la salud reciente de proveedores desde ai_usage y la cachea en memoria
// del proceso (TTL corto) para NO pegarle a la DB en cada complete(). En
// serverless el módulo persiste dentro de una instancia caliente; en frío se
// recalcula. Tolerante: si algo falla (o faltan columnas pre-migración),
// devuelve vacío → el router se comporta como siempre.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LlmProvider } from './types'
import { computeHealth, degradedProviders, type UsageRow } from './providerHealth'

const TTL_MS = 3 * 60 * 1000 // recalcular como mucho cada 3 min
const WINDOW_MS = 2 * 60 * 60 * 1000 // mirar las últimas 2h de telemetría

let cache: { at: number; degraded: Set<LlmProvider> } | null = null

/** Proveedores a degradar (lentos/caídos) según la telemetría reciente. Cacheado. */
export async function getDegradedProviders(supabase: SupabaseClient, nowMs: number = Date.now()): Promise<Set<LlmProvider>> {
  if (cache && nowMs - cache.at < TTL_MS) return cache.degraded
  let degraded = new Set<LlmProvider>()
  try {
    const since = new Date(nowMs - WINDOW_MS).toISOString()
    const { data, error } = await supabase
      .from('ai_usage')
      .select('model, status, latency_ms, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)
    if (!error && data) {
      const health = computeHealth(data as UsageRow[], { nowMs })
      degraded = degradedProviders(health)
    }
  } catch {
    /* tolerante: sin señal → sin degradación */
  }
  cache = { at: nowMs, degraded }
  return degraded
}

/** Solo para tests: limpia el caché. */
export function __resetHealthCache(): void {
  cache = null
}
