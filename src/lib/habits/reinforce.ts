// SIR V2 — Reforzar por competencia, no por culpa (12·M7). PURO.
//
// SDT (competencia): la recompensa percibida debe ser el AVANCE propio, no la
// aprobación de SIR. El lenguaje del refuerzo es "vas 6/7" y "N en total", nunca
// "fallaste el domingo". Muestra progreso ACUMULADO + racha, siempre en positivo.
// No inventa: si no hay marcas, no hay mensaje.

const DAY_MS = 86_400_000

export interface HabitReinforcement {
  /** Marcas en los últimos 7 días. */
  weekDone: number
  /** Total acumulado de marcas (en el historial provisto). */
  cumulative: number
  currentStreak: number
  bestStreak: number
  /** Mensaje en positivo (competencia), o null si no hay historial. */
  message: string | null
}

function toDay(iso: string): number | null {
  const t = Date.parse(iso.length <= 10 ? `${iso}T12:00:00Z` : iso)
  return Number.isFinite(t) ? t : null
}

/**
 * Refuerzo por competencia a partir de las marcas de un hábito. `current`/`longest`
 * vienen de computeHabitStreak (no los recomputamos). PURO.
 */
export function habitReinforcement(
  checkinDates: string[],
  current: number,
  longest: number,
  nowMs: number,
): HabitReinforcement {
  const days = checkinDates.map(toDay).filter((t): t is number => t !== null)
  const cumulative = new Set(days.map((t) => Math.floor(t / DAY_MS))).size
  const weekStart = nowMs - 7 * DAY_MS
  const weekDone = new Set(days.filter((t) => t >= weekStart).map((t) => Math.floor(t / DAY_MS))).size

  let message: string | null = null
  if (cumulative > 0) {
    const base = `Vas ${weekDone}/7 esta semana · ${cumulative} en total.`
    let tail: string
    if (current >= 3) tail = `Racha de ${current} días — no la sueltes.`
    else if (weekDone >= 4) tail = 'Buen ritmo esta semana.'
    else if (longest >= 3) tail = `Tu mejor racha fue ${longest}. Cada marca vuelve a sumar.`
    else tail = 'Cada día que marcás suma — retomá cuando puedas, sin drama.'
    message = `${base} ${tail}`
  }

  return { weekDone, cumulative, currentStreak: current, bestStreak: longest, message }
}
