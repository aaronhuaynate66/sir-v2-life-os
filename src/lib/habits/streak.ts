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
// Perú (Lima) = UTC-5 todo el año (sin horario de verano). Los hábitos se
// agrupan por DÍA DE LIMA, no UTC: si no, lo que marcás de noche (19:00-23:59
// Lima) cae al día siguiente en UTC y corrompe racha / "hoy" / la hora.
const LIMA_OFFSET_MS = 5 * 3_600_000

/** Día de Lima de un instante, como 'YYYY-MM-DD'. */
export function limaDayString(d: Date = new Date()): string {
  return new Date(d.getTime() - LIMA_OFFSET_MS).toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' → índice de día entero (UTC), o null si inválida. */
function dayIndex(isoDate: string): number | null {
  const ms = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return Math.floor(ms / DAY_MS)
}

function todayIndex(today: Date): number {
  return Math.floor((today.getTime() - LIMA_OFFSET_MS) / DAY_MS)
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

// ─── Tira de los últimos N días (para ver QUÉ días se marcó, incl. hoy) ──────
export interface DayMark {
  /** 'YYYY-MM-DD'. */
  iso: string
  /** ¿Se marcó ese día? */
  done: boolean
  /** ¿Es hoy? */
  isToday: boolean
}

/** Devuelve los últimos `n` días (más viejo → hoy) con si estaban marcados.
 *  Resuelve la confusión "¿el check es de hoy o de otra fecha?". Puro. */
export function recentDayMarks(
  checkinDates: string[],
  today: Date = new Date(),
  n = 7,
): DayMark[] {
  const set = new Set(checkinDates.map((d) => d.slice(0, 10)))
  const out: DayMark[] = []
  const todayIdx = Math.floor((today.getTime() - LIMA_OFFSET_MS) / DAY_MS)
  for (let i = n - 1; i >= 0; i--) {
    const iso = new Date((todayIdx - i) * DAY_MS).toISOString().slice(0, 10)
    out.push({ iso, done: set.has(iso), isToday: i === 0 })
  }
  return out
}
