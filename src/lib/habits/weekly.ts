// SIR V2 — Hábitos: racha/consistencia para cadencia SEMANAL (Nx por semana).
// La racha diaria (streak.ts) no aplica a "entrenar 3x/semana": acá la unidad es
// la SEMANA (lunes-domingo). Una semana "cuenta" si llegó al target. PURA, UTC
// (consistente con streak.ts y el resto del módulo).

const DAY_MS = 86_400_000

function dayIndex(isoDate: string): number | null {
  const ms = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return Math.floor(ms / DAY_MS)
}
function todayIndex(today: Date): number {
  return Math.floor(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) / DAY_MS)
}
/** Índice del lunes de la semana de `di` (Mon=0). epoch day 0 = jueves. */
function mondayOf(di: number): number {
  const dow = ((di % 7) + 3) % 7 // 0 = lunes
  return di - dow
}

export interface WeeklyStreak {
  /** Cumplidos en la semana actual. */
  thisWeek: number
  /** Meta por semana. */
  target: number
  /** Semanas consecutivas que llegaron al target (cuenta la actual si ya llegó). */
  weeksStreak: number
  /** % de semanas que llegaron al target en la ventana. */
  consistency: number
  /** ¿Hay checkin hoy? */
  doneToday: boolean
}

export function computeWeeklyStreak(
  checkinDates: string[],
  target = 1,
  today: Date = new Date(),
  windowWeeks = 8,
): WeeklyStreak {
  const tgt = Math.max(1, Math.min(7, Math.trunc(target)))
  const todayIdx = todayIndex(today)
  const counts = new Map<number, number>() // mondayIndex → checkins en esa semana
  let doneToday = false
  for (const d of checkinDates ?? []) {
    const di = dayIndex(d)
    if (di === null) continue
    if (di === todayIdx) doneToday = true
    const m = mondayOf(di)
    counts.set(m, (counts.get(m) ?? 0) + 1)
  }
  const m0 = mondayOf(todayIdx)
  const thisWeek = counts.get(m0) ?? 0

  // Racha de semanas: arranca en la actual si ya llegó, si no en la anterior.
  let weeksStreak = 0
  let anchor = (counts.get(m0) ?? 0) >= tgt ? m0 : m0 - 7
  while ((counts.get(anchor) ?? 0) >= tgt) {
    weeksStreak += 1
    anchor -= 7
  }

  // Consistencia: semanas que llegaron al target en las últimas `windowWeeks`.
  let met = 0
  for (let i = 0; i < windowWeeks; i++) {
    if ((counts.get(m0 - i * 7) ?? 0) >= tgt) met += 1
  }
  const consistency = Math.round((met / windowWeeks) * 100)

  return { thisWeek, target: tgt, weeksStreak, consistency, doneToday }
}
