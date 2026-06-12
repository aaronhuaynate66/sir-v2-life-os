// SIR V2 — Relevancia temporal de señales (fuente única de verdad).
//
// Una señal sin resolver deja de ser "activa/ahora" cuando está estancada: ya
// pasó su `expiresAt`, o lleva más de STALE_SIGNAL_DAYS días sin resolverse
// (ej. una alerta de FC de hace 11 días). Se usa en el panel de Señales activas
// (Mission Control) y en buildAgenda ("Lo que importa ahora"). PURO.

import type { Signal } from '@/types'

export const STALE_SIGNAL_DAYS = 7
const DAY_MS = 86_400_000

/** ¿La señal ya no es relevante por antigüedad/expiración? (No mira `resolved`). */
export function isSignalStale(signal: Signal, now: Date = new Date()): boolean {
  const nowMs = now.getTime()
  if (signal.expiresAt) {
    const exp = Date.parse(signal.expiresAt)
    if (!Number.isNaN(exp) && exp < nowMs) return true
  }
  const det = Date.parse(signal.detectedAt)
  if (!Number.isNaN(det) && nowMs - det > STALE_SIGNAL_DAYS * DAY_MS) return true
  return false
}
