// SIR V2 — Calendario proactivo: qué le puede OFRECER SIR para agendar.
//
// Ahora que SIR escribe en Google Calendar (OAuth calendar.events), reunimos
// cosas con fecha que valen la pena tener en el calendario —cumpleaños y fechas
// importantes de tu gente, y las TAREAS de objetivos con deadline— y las
// ofrecemos para agendar con un clic. Dedup contra lo que YA está en el
// calendario (por título). PURO y testeable; la escritura la hace
// /api/calendar/events.

import type { Person, SpecialDate, ObjectiveStep } from '@/types'
import { computeSpecialDateCountdown, isEffectivelyRecurring } from '@/lib/dates/specialDates'

export interface Agendable {
  /** Clave estable para dedup/dismiss en la UI. */
  key: string
  /** 'fecha' = cumpleaños/fecha importante de una persona · 'tarea' = paso de objetivo. */
  kind: 'fecha' | 'tarea'
  /** Título del evento a crear. */
  title: string
  /** Próxima ocurrencia, YYYY-MM-DD. */
  date: string
  /** 'HH:MM' (reloj Lima) si la tarea tiene hora → evento con hora; ausente → día completo. */
  time?: string
  daysUntil: number
  /** true → evento anual (cumple/aniversario): se crea recurrente. */
  recurring: boolean
  /** Contexto para la UI: primer nombre de la persona (fecha), o undefined (tarea). */
  context?: string
}

const DEFAULT_HORIZON = 45
const DAY = 86_400_000

function firstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || name
}

/** YYYY-MM-DD desde una Date LOCAL (sin correr el día por TZ). */
function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Días enteros desde hoy hasta una fecha date-only ('YYYY-MM-DD'), en TZ local. */
function daysUntilLocal(dateOnly: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOnly)
  if (!m) return null
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Math.round((target.getTime() - startOfLocalDay(now).getTime()) / DAY)
}

function normTitle(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

type AgendablePerson = Pick<Person, 'id' | 'name' | 'specialDates' | 'birthDate'>

/**
 * Reúne las fechas próximas (cumpleaños + fechas importantes) de todas las
 * personas dentro de `horizonDays`, que NO estén ya en el calendario. PURO.
 */
export function collectAgendables(
  people: ReadonlyArray<AgendablePerson>,
  existingTitles: ReadonlyArray<string> = [],
  now: Date = new Date(),
  horizonDays: number = DEFAULT_HORIZON,
): Agendable[] {
  const have = new Set(existingTitles.map(normTitle))
  const out: Agendable[] = []
  const seen = new Set<string>()

  for (const p of people) {
    const dates: SpecialDate[] = [...(p.specialDates ?? [])]
    if (p.birthDate) {
      dates.push({ id: `bday-${p.id}`, label: `Cumpleaños de ${firstName(p.name)}`, date: p.birthDate, recurring: true })
    }
    for (const sd of dates) {
      const cd = computeSpecialDateCountdown(sd, now)
      if (!cd || cd.isPast || cd.daysUntil < 0 || cd.daysUntil > horizonDays) continue
      const title = (sd.label || '').trim()
      if (!title || have.has(normTitle(title))) continue
      const key = `${p.id}:${sd.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        key, kind: 'fecha', title, date: localYmd(cd.occurrence),
        daysUntil: cd.daysUntil, recurring: isEffectivelyRecurring(sd), context: firstName(p.name),
      })
    }
  }

  return out.sort((a, b) => a.daysUntil - b.daysUntil)
}

type AgendableStep = Pick<ObjectiveStep, 'id' | 'kind' | 'title' | 'targetDate' | 'dueTime' | 'status' | 'completedAt'>

/**
 * Reúne las TAREAS de objetivos con deadline (targetDate) dentro de `horizonDays`,
 * NO hechas y NO ya en el calendario. Con `dueTime` → evento con hora. PURO.
 */
export function collectTaskAgendables(
  steps: ReadonlyArray<AgendableStep>,
  existingTitles: ReadonlyArray<string> = [],
  now: Date = new Date(),
  horizonDays: number = DEFAULT_HORIZON,
): Agendable[] {
  const have = new Set(existingTitles.map(normTitle))
  const out: Agendable[] = []
  for (const s of steps) {
    if (s.kind !== 'task' || s.status === 'hecho' || s.status === 'descartado' || s.completedAt || !s.targetDate) continue
    const daysUntil = daysUntilLocal(s.targetDate, now)
    if (daysUntil == null || daysUntil < 0 || daysUntil > horizonDays) continue
    const title = (s.title || '').trim()
    if (!title || have.has(normTitle(title))) continue
    out.push({
      key: `task:${s.id}`, kind: 'tarea', title, date: s.targetDate.slice(0, 10),
      time: s.dueTime || undefined, daysUntil, recurring: false,
    })
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil)
}
