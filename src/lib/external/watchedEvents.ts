// SIR V2 — "Eventos que sigo" (18·M3), capa pura.
//
// Señales externas por el camino MANUAL (docs/18): Aaron declara eventos externos
// que le importan; este módulo los ordena por proximidad, los etiqueta con una
// banda temporal legible y los agrupa por el NODO tuyo que tocan. Determinístico.
// La red (CRUD) vive en /api/watched-events.

export type WatchedNode = 'finanzas' | 'objetivo' | 'persona' | 'salud' | 'general'

export const WATCHED_NODES: readonly WatchedNode[] = ['finanzas', 'objetivo', 'persona', 'salud', 'general']

export const NODE_LABEL: Record<WatchedNode, string> = {
  finanzas: 'Finanzas',
  objetivo: 'Objetivo',
  persona: 'Persona',
  salud: 'Salud',
  general: 'General',
}

export interface WatchedEvent {
  id: string
  title: string
  /** YYYY-MM-DD. */
  eventDate: string
  node: WatchedNode
  relatedId: string | null
  impact: string
  createdAt: string
}

export type Proximity = 'passed' | 'today' | 'this_week' | 'this_month' | 'later'

export interface ClassifiedEvent extends WatchedEvent {
  daysUntil: number
  proximity: Proximity
  whenLabel: string
}

/** Días enteros desde `todayKey` (YYYY-MM-DD) hasta `eventDate`. */
export function daysUntil(eventDate: string, todayKey: string): number {
  const a = parseKey(todayKey)
  const b = parseKey(eventDate)
  if (a == null || b == null) return 0
  return Math.round((b - a) / 86_400_000)
}

function parseKey(k: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(k ?? '')
  if (!m) return null
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  return Number.isFinite(t) ? t : null
}

function proximityOf(days: number): Proximity {
  if (days < 0) return 'passed'
  if (days === 0) return 'today'
  if (days <= 7) return 'this_week'
  if (days <= 31) return 'this_month'
  return 'later'
}

function whenLabelOf(days: number): string {
  if (days < 0) return days === -1 ? 'ayer' : `hace ${Math.abs(days)} días`
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  if (days <= 31) return `en ${days} días`
  const weeks = Math.round(days / 7)
  if (days <= 60) return `en ~${weeks} semanas`
  return `en ~${Math.round(days / 30)} meses`
}

/**
 * Ordena y clasifica los eventos: primero los PRÓXIMOS (por fecha ascendente),
 * los pasados al final (por recencia). Cada uno con daysUntil + banda + etiqueta.
 * `includePassedDays` mantiene visibles los que pasaron hace <= N días (default 3).
 */
export function classifyWatchedEvents(events: WatchedEvent[], todayKey: string, includePassedDays = 3): ClassifiedEvent[] {
  const classified = events.map((e) => {
    const d = daysUntil(e.eventDate, todayKey)
    return { ...e, daysUntil: d, proximity: proximityOf(d), whenLabel: whenLabelOf(d) }
  })
  const visible = classified.filter((e) => e.daysUntil >= -includePassedDays)
  // Próximos primero (menor daysUntil >= 0), luego los recién pasados.
  return visible.sort((a, b) => {
    const aFuture = a.daysUntil >= 0
    const bFuture = b.daysUntil >= 0
    if (aFuture !== bFuture) return aFuture ? -1 : 1
    return aFuture ? a.daysUntil - b.daysUntil : b.daysUntil - a.daysUntil
  })
}

export function normalizeNode(v: unknown): WatchedNode {
  return typeof v === 'string' && (WATCHED_NODES as readonly string[]).includes(v) ? (v as WatchedNode) : 'general'
}
