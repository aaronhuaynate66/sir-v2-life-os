// SIR V2 — Decisión PURA de rate limiting (fixed window). Auditoría: riesgo #1.
//
// Separada del I/O a propósito: el RPC atómico (check_rate_limit) sólo cuenta y
// resetea la ventana en SQL y devuelve el contador crudo; ACÁ decidimos
// allow/deny, remaining y Retry-After. Sin Date.now() ni red → determinista y
// testeable (ver window.test.ts).

import type { RateTier } from './config'

export interface RateDecision {
  /** ¿Se permite este request? (hits <= limit del tier). */
  allowed: boolean
  /** Requests restantes en la ventana (clamp a 0). */
  remaining: number
  /** Segundos hasta poder reintentar (0 si allowed). Para el header Retry-After. */
  retryAfterSec: number
  /** Epoch ms en que la ventana actual se resetea. */
  resetAtMs: number
}

/**
 * Decide sobre un contador de ventana fija ya incrementado atómicamente.
 *
 * @param hits          Conteo de requests en la ventana (incluye el actual).
 * @param windowStartMs Epoch ms del inicio de la ventana (lo da el RPC).
 * @param nowMs         Epoch ms "ahora" del SERVER (lo da el RPC → sin skew).
 * @param tier          Límite + tamaño de ventana.
 *
 * Borde: con limit=10, el request #10 (hits=10) se PERMITE; el #11 se deniega.
 */
export function decide(
  hits: number,
  windowStartMs: number,
  nowMs: number,
  tier: RateTier,
): RateDecision {
  const allowed = hits <= tier.limit
  const remaining = Math.max(0, tier.limit - hits)
  const resetAtMs = windowStartMs + tier.windowMs
  const retryAfterSec = allowed ? 0 : Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000))
  return { allowed, remaining, retryAfterSec, resetAtMs }
}
