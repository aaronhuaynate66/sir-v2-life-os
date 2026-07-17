// SIR V2 — Consumo de IA (#125). Registra tokens por feature y estima costo.
// La API de Anthropic no da SALDO; esto es el CONSUMO propio de SIR.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TokenUsage { input_tokens?: number; output_tokens?: number }

/** Precios estimados (USD por 1M tokens). Aprox públicos; etiquetar "estimado". */
const PRICES: Record<string, { in: number; out: number }> = {
  sonnet: { in: 3, out: 15 },
  haiku: { in: 0.8, out: 4 },
  opus: { in: 15, out: 75 },
}

function tier(model: string | null | undefined): 'sonnet' | 'haiku' | 'opus' {
  const m = (model || '').toLowerCase()
  if (m.includes('haiku')) return 'haiku'
  if (m.includes('opus')) return 'opus'
  return 'sonnet'
}

/** Costo estimado en USD de un consumo. PURO. */
export function estimateCostUSD(model: string | null | undefined, inputTokens: number, outputTokens: number): number {
  const p = PRICES[tier(model)]
  return (inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out
}

/** Metadatos del intento para el router auto-ajustable. */
export interface AttemptMeta {
  /** Latencia del intento en ms. */
  latencyMs?: number
  /** 'ok' | 'error'. Default 'ok'. Los 'error' se registran aunque no haya tokens. */
  status?: 'ok' | 'error'
}

/** Registra un consumo (best-effort, nunca rompe el flujo principal).
 *  Con `meta` guarda latencia + estado para medir salud de proveedores. */
export async function recordAiUsage(
  supabase: SupabaseClient,
  userId: string,
  feature: string,
  model: string | null,
  usage: TokenUsage | null | undefined,
  meta?: AttemptMeta,
): Promise<void> {
  const status = meta?.status ?? 'ok'
  const input = Math.max(0, Math.round(usage?.input_tokens ?? 0))
  const output = Math.max(0, Math.round(usage?.output_tokens ?? 0))
  // Éxitos sin tokens no valen la pena; los FALLOS sí (los necesita la salud).
  if (status === 'ok' && input === 0 && output === 0) return
  const base = { user_id: userId, feature, model, input_tokens: input, output_tokens: output }
  const latency_ms = typeof meta?.latencyMs === 'number' && Number.isFinite(meta.latencyMs)
    ? Math.max(0, Math.round(meta.latencyMs))
    : null
  try {
    const { error } = await supabase.from('ai_usage').insert({ ...base, status, latency_ms })
    if (error) throw error
  } catch {
    // Tolerante a pre-migración: si aún no existen status/latency_ms, insert mínimo.
    try { await supabase.from('ai_usage').insert(base) } catch { /* best-effort */ }
  }
}
