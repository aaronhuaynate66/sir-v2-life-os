// SIR V2 — Resumen del ledger de sugerencias (PURO). Alimenta el panel
// "Qué está aprendiendo SIR": hace VISIBLE el loop de retroalimentación.

import type { Suggestion } from './types'

export interface LedgerSummary {
  total: number
  /** Resueltas: accepted | dismissed | done. */
  resolved: number
  worked: number
  didnt: number
  up: number
  down: number
  /** worked / (worked + didnt), 0-100, o null si nada tiene outcome medido. */
  workRate: number | null
  /** Conteo por tipo, desc. */
  byKind: Array<{ kind: string; count: number }>
}

export function summarizeLedger(rows: Suggestion[]): LedgerSummary {
  let resolved = 0, worked = 0, didnt = 0, up = 0, down = 0
  const kinds = new Map<string, number>()
  for (const r of rows) {
    if (r.status === 'accepted' || r.status === 'dismissed' || r.status === 'done') resolved++
    if (r.outcome === 'worked') worked++
    else if (r.outcome === 'didnt') didnt++
    if (r.feedback === 'up') up++
    else if (r.feedback === 'down') down++
    kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1)
  }
  const rated = worked + didnt
  return {
    total: rows.length,
    resolved, worked, didnt, up, down,
    workRate: rated > 0 ? Math.round((worked / rated) * 100) : null,
    byKind: [...kinds.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
  }
}
