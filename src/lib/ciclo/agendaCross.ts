// SIR V2 — Cruce ventana sensible × agenda. PURO.
//
// POR QUÉ (docs/CABLEADO.md, cruce #3): SIR ya sabe qué mujeres del círculo
// tienen una ventana sensible del ciclo esta semana (buildCycleWeekAhead) y sabe
// qué tiene Aaron agendado (personal_events + calendario). Las dos cosas viven
// separadas: nadie mira si LA REUNIÓN CON ELLA cae justo ahí.
//
// ÉTICA (misma línea que weekAhead.ts, doc 17): esto es TIMING y CUIDADO, no
// gestión de la otra persona. La copy dice "conviene suavidad", "date margen",
// "no lo apures" — JAMÁS "aprovecha", "evita", "va a estar difícil". El ciclo
// MODULA, no dicta: un plan no se cancela por esto, se lleva con más cuidado.
// Y siempre marcado como ESTIMACIÓN.
//
// No inventa eventos ni personas: cruza lo que ya está agendado CON esa persona.

import type { SensitiveWindow } from './weekAhead'

/** Un evento de la agenda de Aaron, reducido a lo que el cruce necesita. */
export interface AgendaEventLite {
  /** YYYY-MM-DD. */
  date: string
  title: string
  /** Persona con la que es el evento, si se sabe. Sin esto no hay cruce. */
  personId?: string | null
}

export interface CycleAgendaHit {
  date: string
  title: string
  personId: string
  name: string
  kind: SensitiveWindow['kind']
  confidence: SensitiveWindow['confidence']
}

/** ¿`day` cae dentro de [start, end]? Comparación lexicográfica de YYYY-MM-DD. */
function within(day: string, start: string, end: string): boolean {
  return day >= start && day <= end
}

/**
 * Eventos agendados que caen dentro de la ventana sensible de la persona con la
 * que son. Ordenados por fecha. PURA.
 *
 * Solo cruza eventos con `personId`: un almuerzo genérico no dice nada de nadie.
 */
export function crossAgendaWithCycles(
  events: AgendaEventLite[],
  windows: SensitiveWindow[],
  opts: { from?: string; to?: string } = {},
): CycleAgendaHit[] {
  const byPerson = new Map(windows.map((w) => [w.personId, w]))
  const hits: CycleAgendaHit[] = []
  for (const e of events) {
    if (!e?.personId || !e.date) continue
    if (opts.from && e.date < opts.from) continue
    if (opts.to && e.date > opts.to) continue
    const w = byPerson.get(e.personId)
    if (!w) continue
    if (!within(e.date, w.windowStart, w.windowEnd)) continue
    hits.push({
      date: e.date, title: (e.title || '').trim() || 'lo que tienes con ella',
      personId: w.personId, name: w.name, kind: w.kind, confidence: w.confidence,
    })
  }
  return hits.sort((a, b) => a.date.localeCompare(b.date))
}

/** "hoy" / "mañana" / "el 30-jul". PURA. */
function whenLabel(date: string, todayKey: string): string {
  if (date === todayKey) return 'hoy'
  const t = Date.parse(`${todayKey}T12:00:00Z`)
  if (Number.isFinite(t) && date === new Date(t + 86_400_000).toISOString().slice(0, 10)) return 'mañana'
  const [, m, d] = date.split('-')
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
  const mes = MESES[Number(m) - 1] ?? m
  return `el ${Number(d)}-${mes}`
}

/**
 * Una línea para el brief, o null si no hay nada que decir. Tono de CUIDADO:
 * nombra el plan y sugiere margen, sin adjetivar a la persona. PURA.
 */
export function renderCycleAgendaLine(hits: CycleAgendaHit[], todayKey: string): string | null {
  if (hits.length === 0) return null
  const h = hits[0]
  const cuando = whenLabel(h.date, todayKey)
  const fase = h.kind === 'menstrual' ? 'en fase menstrual' : 'en ventana premenstrual'
  const extra = hits.length > 1 ? ` (y ${hits.length - 1} plan${hits.length > 2 ? 'es' : ''} más así esta semana)` : ''
  return `Tienes "${h.title}" con ${h.name.split(/\s+/)[0]} ${cuando} y cae ${fase} (estimación)${extra} — date margen y llévalo suave; si se puede mover sin costo, mejor.`
}
