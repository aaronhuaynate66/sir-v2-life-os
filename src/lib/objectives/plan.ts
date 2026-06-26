// SIR V2 — Plan de acción del objetivo (tipos + helpers puros).
export interface ObjectivePlan {
  goalId: string
  eventDate: string | null   // YYYY-MM-DD
  travelStart: string | null
  travelEnd: string | null
  location: string | null
  notes: string | null
}
export interface ObjectiveBlocker {
  id: string
  goalId: string
  title: string
  dueOn: string | null
  done: boolean
  sort: number
}

interface RawPlan { goal_id: string; event_date: string | null; travel_start: string | null; travel_end: string | null; location: string | null; notes: string | null }
export function mapPlanRow(r: RawPlan): ObjectivePlan {
  return {
    goalId: r.goal_id,
    eventDate: r.event_date ? r.event_date.slice(0, 10) : null,
    travelStart: r.travel_start ? r.travel_start.slice(0, 10) : null,
    travelEnd: r.travel_end ? r.travel_end.slice(0, 10) : null,
    location: r.location, notes: r.notes,
  }
}
interface RawBlocker { id: string; goal_id: string; title: string; due_on: string | null; done: boolean; sort: number }
export function mapBlockerRow(r: RawBlocker): ObjectiveBlocker {
  return { id: r.id, goalId: r.goal_id, title: r.title, dueOn: r.due_on ? r.due_on.slice(0, 10) : null, done: !!r.done, sort: r.sort ?? 0 }
}

/** Días enteros hasta una fecha date-only (>=0 futuro, 0 hoy, <0 pasado). null si inválida. */
export function daysUntil(dateIso: string | null | undefined, now: Date = new Date()): number | null {
  if (!dateIso) return null
  const t = Date.parse(`${dateIso.slice(0, 10)}T00:00:00`)
  if (!Number.isFinite(t)) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((t - today) / 86_400_000)
}

/** Frase corta de countdown. */
export function countdownLabel(dateIso: string | null | undefined, now: Date = new Date()): string | null {
  const d = daysUntil(dateIso, now)
  if (d === null) return null
  if (d > 1) return `faltan ${d} días`
  if (d === 1) return 'falta 1 día'
  if (d === 0) return 'es hoy'
  return `hace ${Math.abs(d)} días`
}

/** Progreso del plan: % de bloqueos resueltos. null si no hay. */
export function blockersProgress(blockers: ObjectiveBlocker[]): number | null {
  if (blockers.length === 0) return null
  return Math.round((blockers.filter((b) => b.done).length / blockers.length) * 100)
}
