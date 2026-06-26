// SIR V2 — Capa de contexto externo (Motor #8), señal: tipo de cambio.
// Una señal externa (USD/PEN) que TOCA un nodo (un objetivo-viaje con costo en
// dólares) y solo se vuelve relevante si SE MOVIÓ vs tu última visita (filtro de
// acción: si no cambió, no molesta). PURO.

export type FxDirection = 'up' | 'down' | 'flat' | 'none'
export interface FxSignal {
  rate: number
  baseline: number | null
  deltaPct: number | null
  direction: FxDirection
}

const FLAT_THRESHOLD_PCT = 0.5  // <0.5% = estable (no molestar)

export function computeFxSignal(rate: number, baseline: number | null): FxSignal {
  if (baseline == null || baseline <= 0 || !Number.isFinite(rate)) {
    return { rate, baseline, deltaPct: null, direction: 'none' }
  }
  const d = ((rate - baseline) / baseline) * 100
  const direction: FxDirection = Math.abs(d) < FLAT_THRESHOLD_PCT ? 'flat' : d > 0 ? 'up' : 'down'
  return { rate, baseline, deltaPct: Math.round(d * 100) / 100, direction }
}

/** Impacto en PEN sobre un monto en USD al moverse el tipo de cambio (rate - baseline). */
export function penImpact(usdAmount: number, rate: number, baseline: number): number {
  if (!Number.isFinite(usdAmount) || !Number.isFinite(rate) || !Number.isFinite(baseline)) return 0
  return Math.round(usdAmount * (rate - baseline) * 100) / 100
}
