// SIR V2 — Cruce del calendario (Calendar v2) con el horizonte del ciclo. PURO.
//
// Toma los eventos del calendario del usuario (CalendarEvent[], de /api/calendar)
// y los baja a HorizonEventInput[] para que caigan en la línea del ciclo con su
// día/fase + lectura de cuidado (lo hace buildCycleHorizon). El calendario suele
// ser LABORAL (ej. "HNG"), así que por defecto CURA: solo eventos de día
// completo / varios días (viajes, "estás fuera", feriados) + los que mencionan a
// la persona — para no inundar la línea de reuniones. Igual el usuario oculta/
// muestra cada uno con los chips de la card.
//
// LÍNEA ÉTICA (doc 17): esto es para elegir mejor timing y cuidado, nunca presión.

import type { CalendarEvent } from '@/lib/calendar/types'
import type { HorizonEventInput, HorizonEventKind } from './horizon'

// 'upcoming' (default): eventos FUTUROS, deduplicados, con tope por día y total —
//   pensado para un calendario denso/laboral (ej. HNG: 200 eventos, 0 de día
//   completo, ninguno menciona a la persona), donde 'curated' quedaría vacío.
// 'curated': día completo/varios días + menciones de la persona (ideal si hay un
//   calendario personal con viajes/planes). 'all': todo. 'person': solo menciones.
export type CalendarHorizonMode = 'upcoming' | 'curated' | 'all' | 'person'

/** Sin acentos + minúsculas, para comparar nombres/títulos de forma robusta. */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Fecha del evento en día-Lima (UTC-5, sin DST). All-day ya viene 'YYYY-MM-DD';
 * los cronometrados vienen ISO UTC ('…Z') y se corren a Lima antes de recortar,
 * así una reunión de la noche no "salta" de día.
 */
export function limaDateOf(start: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start
  const t = Date.parse(start)
  if (!Number.isFinite(t)) return start.slice(0, 10)
  const lima = new Date(t - 5 * 3_600_000)
  return `${lima.getUTCFullYear()}-${String(lima.getUTCMonth() + 1).padStart(2, '0')}-${String(lima.getUTCDate()).padStart(2, '0')}`
}

/** Heurística de "viaje/estar fuera" → glifo ◆ pero semántica de trip. */
function tripish(title: string): boolean {
  return /\bviaje|vuelo|trip|flight|fuera\b|out of office|\booo\b/i.test(title)
}

interface Candidate extends HorizonEventInput {
  mentionsPerson: boolean
  allDay: boolean
}

/**
 * Baja los eventos del calendario a eventos del horizonte, filtrados por modo.
 * - 'upcoming' (default): futuros (date >= todayIso), tope por día + total; los que
 *   mencionan a la persona y los de día completo tienen prioridad ante el tope.
 * - 'curated': día completo/varios días + los que mencionan a la persona.
 * - 'all': todos (pasá `limit`). - 'person': solo los que mencionan a la persona.
 */
export function calendarEventsToHorizon(
  events: CalendarEvent[],
  opts: {
    personName: string
    fromIso: string
    toIso: string
    mode?: CalendarHorizonMode
    /** Tope total de eventos devueltos. */
    limit?: number
    /** Hoy 'YYYY-MM-DD' (para 'upcoming'). Default: opts.fromIso. */
    todayIso?: string
    /** Máx eventos por día en 'upcoming' (default 2). */
    maxPerDay?: number
  },
): HorizonEventInput[] {
  const mode = opts.mode ?? 'upcoming'
  const first = normalize((opts.personName || '').split(' ')[0] || '')
  const todayIso = opts.todayIso ?? opts.fromIso
  const cands: Candidate[] = []
  const seen = new Set<string>()

  for (const ev of events) {
    const title = (ev.title || '').trim()
    if (!title) continue
    const date = limaDateOf(ev.start)
    if (date < opts.fromIso || date > opts.toIso) continue

    const mentionsPerson =
      first.length >= 3 && normalize(`${title} ${ev.location ?? ''}`).includes(first)

    let include: boolean
    if (mode === 'all') include = true
    else if (mode === 'person') include = mentionsPerson
    else if (mode === 'curated') include = ev.allDay || mentionsPerson
    else include = date >= todayIso // upcoming

    if (!include) continue

    const key = `${date}|${normalize(title)}`
    if (seen.has(key)) continue
    seen.add(key)

    const kind: HorizonEventKind = tripish(title) ? 'trip' : 'calendar'
    cands.push({ date, label: title.slice(0, 40), kind, mentionsPerson, allDay: ev.allDay })
  }

  let selected: Candidate[]
  if (mode === 'upcoming') {
    // Prioridad: menciones de la persona → día completo → el resto; dentro de cada
    // grupo, lo más cercano primero. Aplica tope por día y el total (limit) EN ese
    // orden de prioridad. El render final lo reordena por fecha (buildCycleHorizon):
    // acá sólo elegimos QUÉ entra, no en qué orden se dibuja.
    const prio = (c: Candidate) => (c.mentionsPerson ? 0 : c.allDay ? 1 : 2)
    const ordered = [...cands].sort((a, b) => prio(a) - prio(b) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const maxPerDay = opts.maxPerDay ?? 2
    const cap = typeof opts.limit === 'number' ? opts.limit : Infinity
    const perDay = new Map<string, number>()
    selected = []
    for (const c of ordered) {
      if (selected.length >= cap) break
      const n = perDay.get(c.date) ?? 0
      if (n >= maxPerDay) continue
      perDay.set(c.date, n + 1)
      selected.push(c)
    }
  } else {
    selected = typeof opts.limit === 'number' ? cands.slice(0, opts.limit) : cands
  }

  const out: HorizonEventInput[] = selected.map(({ date, label, kind }) => ({ date, label, kind }))
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return out
}

/**
 * Mergea eventos del horizonte (fechas especiales + calendario) sin duplicar por
 * misma fecha+etiqueta (normalizada). Las fechas especiales tienen prioridad
 * (van primero): si un evento de calendario coincide, se descarta el del cal.
 */
export function mergeHorizonEvents(
  base: HorizonEventInput[],
  extra: HorizonEventInput[],
): HorizonEventInput[] {
  const out: HorizonEventInput[] = []
  const seen = new Set<string>()
  for (const e of [...base, ...extra]) {
    const key = `${e.date}|${normalize(e.label)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return out
}
