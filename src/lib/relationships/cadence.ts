// SIR V2 — Cadencia de contacto sugerida + estado (backlog Clay #2, versión
// "automática"). PURO.
//
// SIR propone CADA CUÁNTO deberías contactar a cada persona (según su fuerza) y,
// contra el último contacto, dice si estás AL DÍA o ATRASADO. Cierra el loop que
// al `timing` engine le faltaba: sabe "hace cuánto no hablás" pero no contra qué
// medirlo. La cadencia sale de la importancia (misma señal que la fuerza), sin
// campo manual todavía. Determinístico, sin LLM.

const DAY = 86_400_000

/** Cadencia objetivo (días) sugerida a partir de la importancia (1-10). Más
 *  importante = contacto más frecuente. */
export function suggestedCadenceDays(importanceScore: number): number {
  const s = Number.isFinite(importanceScore) ? importanceScore : 0
  if (s >= 9) return 7
  if (s >= 7) return 14
  if (s >= 5) return 30
  if (s >= 3) return 60
  return 120
}

export type CadenceState = 'al_dia' | 'atrasado' | 'sin_registro'

export interface CadenceStatus {
  targetDays: number
  sinceDays: number | null
  state: CadenceState
  /** Días de atraso (sinceDays - targetDays) si atrasado; 0 si no. */
  overdueDays: number
}

/** Estado de cadencia de una persona. `lastContactISO` = fecha del último contacto
 *  (YYYY-MM-DD o ISO), o null. `nowMs` para calcular el silencio. */
export function cadenceStatus(
  importanceScore: number,
  lastContactISO: string | null | undefined,
  nowMs: number,
): CadenceStatus {
  const targetDays = suggestedCadenceDays(importanceScore)
  const t = lastContactISO ? Date.parse(lastContactISO) : NaN
  if (!Number.isFinite(t)) {
    return { targetDays, sinceDays: null, state: 'sin_registro', overdueDays: 0 }
  }
  const sinceDays = Math.floor((nowMs - t) / DAY)
  if (sinceDays <= targetDays) {
    return { targetDays, sinceDays, state: 'al_dia', overdueDays: 0 }
  }
  return { targetDays, sinceDays, state: 'atrasado', overdueDays: sinceDays - targetDays }
}
