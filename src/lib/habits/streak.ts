// SIR V2 — Hábitos: racha y consistencia (lógica pura, testeable). Etapa 3.
//
// A partir de las fechas de checkin de un hábito (date-only 'YYYY-MM-DD'),
// computa: racha actual, racha más larga, y consistencia en una ventana.
// PURA + determinística: `today` se inyecta. TZ-independiente (opera sobre
// índices de día derivados de la fecha date-only, sin horas).

export type HabitCadence = 'daily' | 'weekly'

export interface HabitStreak {
  /** Racha actual en días: días consecutivos cumplidos terminando hoy o ayer
   *  (ayer cuenta: el día aún no "se rompió" hasta que termina). */
  current: number
  /** Racha más larga registrada (días consecutivos). */
  longest: number
  /** % de días cumplidos en la ventana (0-100). */
  consistency: number
  /** ¿Hay checkin hoy? */
  doneToday: boolean
}

const DAY_MS = 86_400_000

/** 'YYYY-MM-DD' → índice de día entero (UTC), o null si inválida. */
function dayIndex(isoDate: string): number | null {
  const ms = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return Math.floor(ms / DAY_MS)
}

function todayIndex(today: Date): number {
  return Math.floor(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) / DAY_MS)
}

/** Racha + consistencia diaria. `windowDays` por defecto 30. */
export function computeHabitStreak(
  checkinDates: string[],
  today: Date = new Date(),
  windowDays = 30,
): HabitStreak {
  const todayIdx = todayIndex(today)
  // Set de índices únicos válidos.
  const idx = new Set<number>()
  for (const d of checkinDates ?? []) {
    const di = dayIndex(d)
    if (di !== null) idx.add(di)
  }
  if (idx.size === 0) {
    return { current: 0, longest: 0, consistency: 0, doneToday: false }
  }
  const sorted = [...idx].sort((a, b) => a - b)
  const doneToday = idx.has(todayIdx)

  // Racha más larga: corrida máxima de índices consecutivos.
  let longest = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      run += 1
      if (run > longest) longest = run
    } else {
      run = 1
    }
  }

  // Racha actual: contar hacia atrás desde hoy (si está) o ayer.
  let current = 0
  let anchor: number | null = null
  if (idx.has(todayIdx)) anchor = todayIdx
  else if (idx.has(todayIdx - 1)) anchor = todayIdx - 1
  if (anchor !== null) {
    let cursor = anchor
    while (idx.has(cursor)) {
      current += 1
      cursor -= 1
    }
  }

  // Consistencia: días cumplidos en [today-windowDays+1, today] / windowDays.
  const windowStart = todayIdx - (windowDays - 1)
  let inWindow = 0
  for (const di of idx) {
    if (di >= windowStart && di <= todayIdx) inWindow += 1
  }
  const consistency = Math.round((inWindow / windowDays) * 100)

  return { current, longest, consistency, doneToday }
}
