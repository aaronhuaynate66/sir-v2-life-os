// SIR V2 — Salud de proveedores LLM (router auto-ajustable, ADR 0011).
//
// El router elige por tier + costo, pero un proveedor barato que está LENTO
// (el qwen de OpenRouter timeaba >30s) o CAÍDO no debería ir primero solo por
// ser barato. Este módulo lee la telemetría reciente de `ai_usage` (latencia y
// éxito/fallo por intento) y emite un veredicto por proveedor. El router lo usa
// para degradar a los degradados. PURO (sin DB): recibe las filas ya leídas.
//
// Filosofía: no castigar con poca evidencia (MIN_ATTEMPTS), ventana corta para
// reaccionar rápido y también recuperarse rápido cuando el proveedor vuelve.

import type { LlmProvider } from './types'

export interface UsageRow {
  /** 'proveedor:modelo' como lo guarda complete() (ej. 'openrouter:deepseek/...'). */
  model: string | null
  /** 'ok' | 'error'. Filas viejas sin status se asumen 'ok'. */
  status?: string | null
  /** Latencia del intento en ms (null en filas viejas). */
  latency_ms?: number | null
  created_at: string
}

export type Verdict = 'healthy' | 'slow' | 'down'

export interface ProviderHealth {
  provider: LlmProvider
  attempts: number
  successRate: number
  /** Mediana de latencia de los intentos OK (ms), o null si no hay. */
  p50Latency: number | null
  verdict: Verdict
}

export interface HealthOpts {
  /** Ahora (ms epoch). Requerido para filtrar la ventana. */
  nowMs: number
  /** Ventana a mirar (ms). Default 2h. */
  windowMs?: number
  /** Mínimo de intentos para emitir un veredicto ≠ healthy. Default 3. */
  minAttempts?: number
  /** Tasa de éxito por debajo de la cual el proveedor está 'down'. Default 0.5. */
  downRate?: number
  /** p50 de latencia (ms) por encima del cual está 'slow'. Default 20s. */
  slowMs?: number
}

const KNOWN: LlmProvider[] = ['anthropic', 'deepseek', 'qwen', 'zhipu', 'moonshot', 'openrouter']

/** Extrae el proveedor del string 'model' de ai_usage. Robusto ante filas viejas. */
export function providerOf(model: string | null | undefined): LlmProvider | null {
  const s = (model || '').toLowerCase()
  if (!s) return null
  const prefix = s.split(':')[0]
  if ((KNOWN as string[]).includes(prefix)) return prefix as LlmProvider
  // Filas viejas sin prefijo de proveedor (ej. 'claude-sonnet-4-5-...').
  if (s.includes('claude')) return 'anthropic'
  return null
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Calcula la salud por proveedor a partir de filas de ai_usage recientes.
 * Devuelve un Map solo con los proveedores que tienen datos en la ventana.
 */
export function computeHealth(rows: UsageRow[], opts: HealthOpts): Map<LlmProvider, ProviderHealth> {
  const windowMs = opts.windowMs ?? 2 * 60 * 60 * 1000
  const minAttempts = opts.minAttempts ?? 3
  const downRate = opts.downRate ?? 0.5
  const slowMs = opts.slowMs ?? 20_000
  const cutoff = opts.nowMs - windowMs

  const agg = new Map<LlmProvider, { attempts: number; ok: number; latencies: number[] }>()
  for (const r of rows ?? []) {
    const t = Date.parse(r.created_at ?? '')
    if (!Number.isFinite(t) || t < cutoff) continue
    const p = providerOf(r.model)
    if (!p) continue
    const a = agg.get(p) ?? { attempts: 0, ok: 0, latencies: [] }
    a.attempts++
    const ok = (r.status ?? 'ok') !== 'error'
    if (ok) {
      a.ok++
      const lat = typeof r.latency_ms === 'number' && Number.isFinite(r.latency_ms) ? r.latency_ms : null
      if (lat !== null) a.latencies.push(lat)
    }
    agg.set(p, a)
  }

  const out = new Map<LlmProvider, ProviderHealth>()
  for (const [provider, a] of agg) {
    const successRate = a.attempts > 0 ? a.ok / a.attempts : 1
    const p50 = median(a.latencies)
    let verdict: Verdict = 'healthy'
    if (a.attempts >= minAttempts) {
      if (successRate < downRate) verdict = 'down'
      else if (p50 !== null && p50 > slowMs) verdict = 'slow'
    }
    out.set(provider, { provider, attempts: a.attempts, successRate, p50Latency: p50, verdict })
  }
  return out
}

/** Proveedores a degradar (lentos o caídos) según la salud. */
export function degradedProviders(health: Map<LlmProvider, ProviderHealth>): Set<LlmProvider> {
  const s = new Set<LlmProvider>()
  for (const [p, h] of health) if (h.verdict !== 'healthy') s.add(p)
  return s
}
