// SIR V2 — Agenda personal (personal_events, mig 0133). Tipos + mapeo puro.
//
// La "capa personal": planes propios de Aaron que SIR escribe/edita, separados
// del calendario laboral. Cuando están ligados a una persona (person_id) caen en
// SU línea del ciclo. Es la capa que, más adelante, un calendario PERSONAL
// conectado (Camino B) también podrá alimentar (source='calendar').

import type { HorizonEventInput } from '@/lib/ciclo/horizon'

export type PersonalEventSource = 'sir' | 'manual' | 'calendar'

/** DTO tal como lo consume el cliente. */
export interface PersonalEvent {
  id: string
  /** Persona con la que es el plan (null = agenda general). */
  personId: string | null
  title: string
  /** Inicio 'YYYY-MM-DD' (TZ Lima). */
  date: string
  /** Fin 'YYYY-MM-DD' para planes de varios días (opcional). */
  endDate: string | null
  allDay: boolean
  note: string | null
  source: PersonalEventSource
}

/** Fila de personal_events (snake_case desde Supabase). */
export interface PersonalEventRow {
  id: string
  person_id: string | null
  title: string
  event_date: string
  end_date: string | null
  all_day: boolean | null
  note: string | null
  source: string | null
  created_at?: string
  updated_at?: string
}

const VALID_SOURCES: readonly PersonalEventSource[] = ['sir', 'manual', 'calendar']

export function rowToPersonalEvent(row: PersonalEventRow): PersonalEvent {
  const source = VALID_SOURCES.includes(row.source as PersonalEventSource) ? (row.source as PersonalEventSource) : 'manual'
  return {
    id: row.id,
    personId: row.person_id ?? null,
    title: (row.title ?? '').trim(),
    date: (row.event_date ?? '').slice(0, 10),
    endDate: row.end_date ? row.end_date.slice(0, 10) : null,
    allDay: row.all_day !== false,
    note: row.note?.trim() || null,
    source,
  }
}

const TRIP_RE = /\bviaje|vuelo|trip|flight|fuera\b|out of office|\booo\b/i

/**
 * Baja los planes personales a eventos del horizonte del ciclo. PURO.
 * Solo los ligados a `personId` (planes con esa persona) y dentro de [from,to].
 * Un plan con la persona es un evento de vínculo → kind 'partner' (glifo ♥ +
 * lectura de cuidado); si es un viaje, 'trip'. Deduplica por fecha+título.
 */
export function personalEventsToHorizon(
  events: PersonalEvent[],
  opts: { personId: string; fromIso: string; toIso: string; limit?: number },
): HorizonEventInput[] {
  const out: HorizonEventInput[] = []
  const seen = new Set<string>()
  for (const ev of events) {
    if (ev.personId !== opts.personId) continue
    const date = ev.date.slice(0, 10)
    if (!date || date < opts.fromIso || date > opts.toIso) continue
    const title = ev.title.trim()
    if (!title) continue
    const key = `${date}|${title.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ date, label: title.slice(0, 40), kind: TRIP_RE.test(title) ? 'trip' : 'partner' })
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return typeof opts.limit === 'number' ? out.slice(0, opts.limit) : out
}
