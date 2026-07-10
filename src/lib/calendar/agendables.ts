// SIR V2 — Calendario proactivo: qué le puede OFRECER SIR para agendar.
//
// Ahora que SIR escribe en Google Calendar (OAuth calendar.events), reunimos
// fechas próximas que valen la pena tener en el calendario —cumpleaños y fechas
// importantes de tu gente— y las ofrecemos para agendar con un clic. Dedup
// contra lo que YA está en el calendario (por título) para no proponer algo que
// ya tenés. PURO y testeable; la escritura la hace /api/calendar/events.

import type { Person, SpecialDate } from '@/types'
import { computeSpecialDateCountdown, isEffectivelyRecurring } from '@/lib/dates/specialDates'

export interface Agendable {
  /** Clave estable (personId:specialDateId) para dedup/dismiss en la UI. */
  key: string
  personId: string
  personName: string
  /** Título del evento a crear. */
  title: string
  /** Fecha de la próxima ocurrencia, YYYY-MM-DD (día completo). */
  date: string
  daysUntil: number
  /** true → evento anual (cumple/aniversario): se crea recurrente. */
  recurring: boolean
}

const DEFAULT_HORIZON = 45

function firstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || name
}

/** YYYY-MM-DD desde una Date LOCAL (sin correr el día por TZ). */
function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normTitle(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

type AgendablePerson = Pick<Person, 'id' | 'name' | 'specialDates' | 'birthDate'>

/**
 * Reúne las fechas próximas (cumpleaños + fechas importantes) de todas las
 * personas dentro de `horizonDays`, que NO estén ya en el calendario (match por
 * título normalizado). Ordenado por cercanía. PURO.
 *
 * @param existingTitles títulos de los eventos que ya están en el calendario.
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
    // El cumpleaños (birth_date) entra como una fecha especial recurrente más.
    if (p.birthDate) {
      dates.push({ id: `bday-${p.id}`, label: `Cumpleaños de ${firstName(p.name)}`, date: p.birthDate, recurring: true })
    }
    for (const sd of dates) {
      const cd = computeSpecialDateCountdown(sd, now)
      if (!cd || cd.isPast || cd.daysUntil < 0 || cd.daysUntil > horizonDays) continue
      const title = (sd.label || '').trim()
      if (!title) continue
      if (have.has(normTitle(title))) continue // ya está en el calendario
      const key = `${p.id}:${sd.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        key,
        personId: p.id,
        personName: p.name,
        title,
        date: localYmd(cd.occurrence),
        daysUntil: cd.daysUntil,
        recurring: isEffectivelyRecurring(sd),
      })
    }
  }

  return out.sort((a, b) => a.daysUntil - b.daysUntil)
}
