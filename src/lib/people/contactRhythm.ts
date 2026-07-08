// SIR V2 — Primitivo compartido del RITMO de contacto. PURO.
//
// Colapsa timestamps de contacto a DÍAS únicos (varios logs el mismo día = un
// contacto) → base para la cadencia (mediana de gaps entre días). Antes esto
// estaba DUPLICADO en `suggestCadenceDays` (cadence.ts) y `forecastTrajectories`
// (prediction/c2/trajectory.ts), con una divergencia sutil (gaps de ms-crudo vs
// día). Unificado acá para que el ritmo se calcule igual en toda la app.

const DAY_MS = 86_400_000

/**
 * Días de contacto ÚNICOS (day-keys enteros), ordenados asc, descartando
 * timestamps futuros o inválidos. Cada log del mismo día colapsa a uno.
 */
export function contactDays(contactMs: Array<number | null | undefined>, nowMs: number): number[] {
  const days = new Set<number>()
  for (const t of contactMs) {
    if (t == null || !Number.isFinite(t) || t > nowMs) continue
    days.add(Math.floor(t / DAY_MS))
  }
  return [...days].sort((a, b) => a - b)
}

/** Gaps (en días enteros) entre días de contacto consecutivos. Vacío si <2 días. */
export function gapsBetweenDays(days: number[]): number[] {
  const gaps: number[] = []
  for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1])
  return gaps
}
