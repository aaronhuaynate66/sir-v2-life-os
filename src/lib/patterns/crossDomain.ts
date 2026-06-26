// SIR V2 — Síntesis cruzada (Motor #7): biología × conducta relacional.
// El motor de Patrones (observe.ts) cruza salud con salud. Esto cruza tu
// BIOLOGÍA (sueño, FC en reposo) con tu CONDUCTA RELACIONAL (tono de tus charlas,
// días con conflicto). MISMA disciplina: reusa compareContinuous/compareBinary,
// que ya traen la guarda de muestra dura (≥10 días alineados, ≥4 por grupo). Si
// no alcanza, NO opina. Observación, NO predicción. Determinístico.

import { compareContinuous, compareBinary, type DayPoint, type CompareResult, type Observation } from './observe'

export interface CrossDomainInput {
  /** Horas de sueño por día. */
  sleepHours: DayPoint[]
  /** FC en reposo por día (bpm). */
  restingHr: DayPoint[]
  /** Tono promedio de las interacciones por día (escala 1-5). */
  relTone: DayPoint[]
  /** Días con al menos un conflicto/episodio (YYYY-MM-DD). */
  conflictDays: Set<string>
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toString()

export function observeCrossDomain(inp: CrossDomainInput): Observation[] {
  const out: Observation[] = []
  const push = (id: string, r: CompareResult | null, lev: number, cla: number, mk: (r: CompareResult) => string) => {
    if (!r) return
    const mag = Math.abs(r.delta)
    if (mag < lev) return
    out.push({ id, text: mk(r), n: r.n, strength: mag >= cla ? 'clara' : 'leve' })
  }

  // Sueño → tono de las charlas (1-5: leve 0.4, clara 0.8)
  push('sueno-tono', compareContinuous(inp.sleepHours, inp.relTone), 0.4, 0.8, (r) =>
    `Las noches que dormiste más, tus charlas del día siguiente fueron más cálidas (${f1(r.avgHigh)}/5 vs ${f1(r.avgLow)}/5 tras dormir poco).`)

  // FC en reposo → tono de las charlas
  push('fc-tono', compareContinuous(inp.restingHr, inp.relTone), 0.4, 0.8, (r) =>
    `Con la FC en reposo más alta, tus charlas promediaron ${f1(r.avgHigh)}/5 vs ${f1(r.avgLow)}/5 con FC más baja.`)

  // Conflicto (binario) → sueño (horas: leve 0.5, clara 1)
  push('conflicto-sueno', compareBinary(inp.sleepHours, inp.conflictDays), 0.5, 1, (r) =>
    `Los días con un conflicto abierto dormiste ${f1(r.avgHigh)}h en promedio, vs ${f1(r.avgLow)}h los demás.`)

  return out
}
