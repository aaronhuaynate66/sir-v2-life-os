// SIR V2 — Resumen del ledger de sugerencias (PURO). Alimenta el panel
// "Qué está aprendiendo SIR": hace VISIBLE el loop de retroalimentación.

import type { Suggestion } from './types'

export interface LedgerSummary {
  total: number
  /** Resueltas: accepted | dismissed | done. */
  resolved: number
  worked: number
  didnt: number
  /**
   * Sugerencias que se dieron por IGNORADAS: pasaron su plazo sin que Aaron actuara.
   *
   * Se cuenta aparte de `didnt` a propósito. `didnt` es "lo intenté y no funcionó"
   * —información sobre el mundo—; `ignored` es "no lo hice" —información sobre la
   * SUGERENCIA—. Mezclarlas haría que un mal consejo se vea como mala suerte.
   */
  ignored: number
  up: number
  down: number
  /** worked / (worked + didnt), 0-100, o null si nada tiene outcome medido. */
  workRate: number | null
  /**
   * worked / (worked + didnt + ignored), 0-100. **La tasa honesta**: incluye lo que
   * Aaron nunca hizo. `workRate` sola puede dar 100 % con una sola sugerencia
   * acertada y veinte ignoradas. null si todavía no hay nada resuelto.
   */
  followRate: number | null
  /** Conteo por tipo, desc. */
  byKind: Array<{ kind: string; count: number }>
}

export function summarizeLedger(rows: Suggestion[]): LedgerSummary {
  let resolved = 0, worked = 0, didnt = 0, ignored = 0, up = 0, down = 0
  const kinds = new Map<string, number>()
  for (const r of rows) {
    if (r.status === 'accepted' || r.status === 'dismissed' || r.status === 'done') resolved++
    if (r.outcome === 'worked') worked++
    else if (r.outcome === 'didnt') didnt++
    else if (r.outcome === 'ignored') ignored++
    if (r.feedback === 'up') up++
    else if (r.feedback === 'down') down++
    kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1)
  }
  const rated = worked + didnt
  const conCierre = worked + didnt + ignored
  return {
    total: rows.length,
    resolved, worked, didnt, ignored, up, down,
    workRate: rated > 0 ? Math.round((worked / rated) * 100) : null,
    followRate: conCierre > 0 ? Math.round((worked / conCierre) * 100) : null,
    byKind: [...kinds.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
  }
}
