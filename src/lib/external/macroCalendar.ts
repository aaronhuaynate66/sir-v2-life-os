// SIR V2 — Señal externa 18·M5: calendario macro (confianza media).
//
// Feriados de Perú + hitos de quincena/fin de mes cruzados con TU agenda y tus
// objetivos, para convertir una fecha macro en una ventana accionable:
//   • "viene un feriado largo → ventana para <objetivo/tu gente>"
//   • "quincena / fin de mes → suele venir con más gasto" (honesto: patrón típico)
// Principios del dominio 18: "solo el cambio es señal" (una fecha estable no se
// muestra si no está por venir dentro del lead) y honestidad (la quincena es un
// PATRÓN habitual, no una certeza). Motor PURO: `now` inyectable, sin I/O ni LLM.

import type { PeruHoliday } from '@/data/peruHolidays'

const DAY_MS = 86_400_000

export type MacroKind = 'long_weekend' | 'payday'

export interface MacroHit {
  id: string
  kind: MacroKind
  title: string
  /** Días hasta el inicio (0 = hoy, >0 futuro). */
  daysUntil: number
  /** Nota accionable, ya cruzada con objetivos si aplica. */
  hint: string
  /** Solo long_weekend: cuántos días seguidos libres. */
  spanDays?: number
}

export interface MacroCalendarInput {
  holidays: PeruHoliday[]
  /** Títulos de objetivos personales/relacionales activos (para "ventana para X"). */
  personalGoals?: string[]
  /** Lead: cuántos días hacia adelante mirar (default 30). */
  leadDays?: number
}

function parseDay(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isWeekend(d: Date): boolean {
  const wd = d.getDay()
  return wd === 0 || wd === 6
}

/**
 * Detecta "puentes": corridas consecutivas de días libres (feriados + fines de
 * semana) de 3+ días que incluyan al menos un feriado y empiecen dentro del lead.
 */
function findLongWeekends(holidays: PeruHoliday[], today: Date, leadDays: number, goalHint: string): MacroHit[] {
  const holiSet = new Set(holidays.map((h) => h.date))
  const holiName = new Map(holidays.map((h) => [h.date, h.name]))
  const hits: MacroHit[] = []
  const seenRun = new Set<string>()

  for (let i = 0; i <= leadDays; i++) {
    const day = new Date(today.getTime() + i * DAY_MS)
    const key = dayKey(day)
    const isOff = holiSet.has(key) || isWeekend(day)
    if (!isOff) continue

    // Retroceder al inicio de la corrida de días libres.
    let start = new Date(day.getTime())
    while (true) {
      const prev = new Date(start.getTime() - DAY_MS)
      if (holiSet.has(dayKey(prev)) || isWeekend(prev)) start = prev
      else break
    }
    const startKey = dayKey(start)
    if (seenRun.has(startKey)) continue
    seenRun.add(startKey)

    // Avanzar al final de la corrida + contar feriados.
    let end = new Date(start.getTime())
    let span = 1
    let holidayCount = holiSet.has(startKey) ? 1 : 0
    while (true) {
      const next = new Date(end.getTime() + DAY_MS)
      if (holiSet.has(dayKey(next)) || isWeekend(next)) {
        end = next
        span++
        if (holiSet.has(dayKey(next))) holidayCount++
      } else break
    }

    if (span < 3 || holidayCount === 0) continue
    const daysUntil = Math.round((start.getTime() - today.getTime()) / DAY_MS)
    if (daysUntil < 0 || daysUntil > leadDays) continue

    // Nombre del/los feriado(s) que originan el puente.
    const names: string[] = []
    for (let d = new Date(start.getTime()); d.getTime() <= end.getTime(); d = new Date(d.getTime() + DAY_MS)) {
      const n = holiName.get(dayKey(d))
      if (n && !names.includes(n)) names.push(n)
    }
    const label = names[0] ?? 'Feriado'
    hits.push({
      id: `lw_${startKey}`,
      kind: 'long_weekend',
      title: names.length > 1 ? `${label} (feriado largo)` : label,
      daysUntil,
      spanDays: span,
      hint: `Viene un finde largo de ${span} días (${label}). Ventana para ${goalHint}. Si algo se planea con anticipación (viaje, gente, un pendiente tuyo), es AHORA.`,
    })
  }
  hits.sort((a, b) => a.daysUntil - b.daysUntil)
  return hits
}

/** Próxima quincena (día 15) o fin de mes dentro de ~8 días → nota honesta. */
function findPayday(today: Date, leadDays: number): MacroHit | null {
  const horizon = Math.min(leadDays, 8)
  for (let i = 0; i <= horizon; i++) {
    const day = new Date(today.getTime() + i * DAY_MS)
    const dom = day.getDate()
    const lastDom = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate()
    const isQuincena = dom === 15
    const isMonthEnd = dom === lastDom
    if (!isQuincena && !isMonthEnd) continue
    const which = isQuincena ? 'La quincena' : 'El fin de mes'
    return {
      id: `payday_${dayKey(day)}`,
      kind: 'payday',
      title: isQuincena ? 'Quincena' : 'Fin de mes',
      daysUntil: i,
      hint: `${which} suele venir con más gasto — es un PATRÓN habitual, no una regla. Si quieres cuidar el mes, decidí antes en qué NO.`,
    }
  }
  return null
}

/**
 * Arma las señales de calendario macro vigentes hoy. Vacío si no hay ningún
 * puente ni quincena por venir dentro del lead. PURO.
 */
export function buildMacroCalendar(input: MacroCalendarInput, now: Date = new Date()): MacroHit[] {
  const leadDays = input.leadDays ?? 30
  const today = startOfDay(now)
  const holidays = input.holidays.filter((h) => parseDay(h.date))

  const goal = input.personalGoals?.[0]
  const goalHint = goal ? `"${goal}"` : 'ti, tu gente o un pendiente tuyo'

  const hits = findLongWeekends(holidays, today, leadDays, goalHint)
  const payday = findPayday(today, leadDays)
  if (payday) hits.push(payday)

  hits.sort((a, b) => a.daysUntil - b.daysUntil)
  return hits
}
