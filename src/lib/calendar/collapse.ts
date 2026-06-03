// SIR V2 — Colapso de eventos recurrentes del calendario.
//
// /agenda invierte su jerarquía: lo accionable (motor proactivo) manda y el
// calendario pasa a contexto secundario. El ruido del calendario son los
// eventos RECURRENTES que ya se saben de memoria (Gym, "Aaron OS — Daily System
// Check", dailies de Teams): duplican a Outlook sin aportar. Acá los plegamos:
//
//   • oneOff : eventos ÚNICOS (recurring=false) — las reuniones puntuales que
//              sí vale la pena ver, en orden cronológico.
//   • series : UNA fila por serie recurrente (la PRÓXIMA ocurrencia), para
//              saber que existen sin inundar. Se muestran plegadas.
//
// La recurrencia ya viene marcada por el parser (CalendarEvent.recurring, true
// cuando la ocurrencia salió de expandir una RRULE) y las ocurrencias de una
// misma serie comparten `uid`. PURO + determinístico, sin I/O.

import type { CalendarEvent } from './types'

export interface CollapsedCalendar {
  /** Eventos únicos (no recurrentes), ordenados por inicio. */
  oneOff: CalendarEvent[]
  /** Próxima ocurrencia de cada serie recurrente, ordenada por inicio. */
  series: CalendarEvent[]
}

/** Clave de serie: el uid (compartido por todas las ocurrencias) o, en su
 *  defecto, el título — para no fusionar series distintas sin uid. */
function seriesKey(ev: CalendarEvent): string {
  return ev.uid || ev.title
}

/**
 * Separa eventos únicos de series recurrentes, dejando una sola fila (la
 * próxima ocurrencia) por serie. Los eventos ya llegan ordenados por inicio
 * desde el feed, pero reordenamos por las dudas para garantizar que la fila
 * elegida sea la MÁS PRÓXIMA y que ambas listas queden cronológicas.
 */
export function collapseRecurring(events: CalendarEvent[]): CollapsedCalendar {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start))
  const oneOff: CalendarEvent[] = []
  const series: CalendarEvent[] = []
  const seen = new Set<string>()

  for (const ev of sorted) {
    if (!ev.recurring) {
      oneOff.push(ev)
      continue
    }
    const key = seriesKey(ev)
    if (seen.has(key)) continue // ya tomamos la próxima ocurrencia de esta serie
    seen.add(key)
    series.push(ev)
  }

  return { oneOff, series }
}
