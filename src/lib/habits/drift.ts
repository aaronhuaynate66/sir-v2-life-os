// SIR V2 — Drift temprano por erosión de contexto (12·M6). PURO.
//
// Wood & Neal: los hábitos se erosionan cuando el contexto que los sostenía se
// cae. `alignment` ya marca drift DESPUÉS; esto suma la señal ANTICIPATORIA: una
// racha con valor a punto de romperse HOY (1 día de gracia antes de perderla) →
// aviso SUAVE antes de la ruptura, no después. Nunca culpa: es una oferta.

/** Racha mínima con valor como para avisar que está en juego. */
const MIN_STREAK_AT_RISK = 3

export interface StreakRisk {
  atRisk: boolean
  message: string | null
}

/**
 * Señala si una racha con valor está en riesgo de romperse hoy (no marcada aún).
 * `current` y `doneToday` vienen de computeHabitStreak. PURO.
 */
export function streakAtRisk(current: number, doneToday: boolean): StreakRisk {
  if (!doneToday && current >= MIN_STREAK_AT_RISK) {
    return {
      atRisk: true,
      message: `Racha de ${current} en juego hoy — un check la mantiene. Tenés hasta esta noche, sin apuro.`,
    }
  }
  return { atRisk: false, message: null }
}
