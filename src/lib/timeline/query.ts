// SIR V2 — Timeline query layer (Fase 3a Issue #71)
//
// Reemplaza la capa de fixtures por queries reales a Supabase. La interfaz
// publica (fetchPage, activeTypes, DEFAULT_FILTERS) se mantiene identica
// — useTimelineQuery NO cambia. Adapters tampoco cambian: la shape
// TimelineEvent es estable.
//
// Pipeline por tipo (2 etapas de adaptacion):
//   Supabase row -> sync adapter.fromRow -> native type (Memory, etc.)
//   native type -> timeline adapter -> TimelineEvent
//
// Las queries respetan las 6 Implementation Notes del ADR 0005:
//   #1 Partial failure: Promise.allSettled distingue por tipo (sigue ok).
//   #2 ISO 8601 validation: vive en adapters/relational_event.ts.
//   #3 AbortController: .abortSignal(signal) en cada query Supabase.
//   #4 Empty states: flags ya en useTimelineQuery (no se tocan).
//   #5 Omitir .ilike() vacio: solo si sanitizeSearch(...) != ''.
//   #6 Boton detalle condicional: la UI ya lo oculta en todos los tipos.

'use client'

import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/client'
import {
  memoryAdapter,
  financeMovementAdapter,
  signalAdapter,
  goalAdapter,
  selfMetricAdapter,
  healthMetricAdapter,
  sleepRecordAdapter,
  personAdapter,
  relationshipAdapter,
} from '@/lib/supabase/sync'

import { adaptMemories } from './adapters/memory'
import { adaptSelfMetrics } from './adapters/self_metric'
import { adaptHealthMetrics } from './adapters/health_metric'
import { adaptSleeps } from './adapters/sleep'
import { adaptFinances } from './adapters/finance'
import { adaptSignals } from './adapters/signal'
import { adaptGoals } from './adapters/goal'
import { adaptPeople } from './adapters/people'
import { adaptRelationalHistory, adaptRelationalEventRows } from './adapters/relational_event'
import { groupByCapture } from './grouping'

import {
  type FetchTypeResult,
  type TimelineCursor,
  type TimelineEvent,
  type TimelineEventType,
  type TimelineFilters,
  ALL_EVENT_TYPES,
  TIMELINE_PAGE_SIZE,
  DEFAULT_FILTERS,
} from './types'

// ─── helpers ────────────────────────────────────────────────────────

export function activeTypes(filters: TimelineFilters): TimelineEventType[] {
  if (filters.types.size === 0) return [...ALL_EVENT_TYPES]
  return ALL_EVENT_TYPES.filter((t) => filters.types.has(t))
}

function dateRangeStartIso(filters: TimelineFilters): string | null {
  const now = Date.now()
  switch (filters.dateRange) {
    case 'today': {
      const d = new Date(now)
      d.setUTCHours(0, 0, 0, 0)
      return d.toISOString()
    }
    case '7d':   return new Date(now -   7 * 86400000).toISOString()
    case '30d':  return new Date(now -  30 * 86400000).toISOString()
    case '90d':  return new Date(now -  90 * 86400000).toISOString()
    case '1y':   return new Date(now - 365 * 86400000).toISOString()
    case 'all':  return null
    default:     return null
  }
}

function dateOnlyFromIso(iso: string): string {
  // "2026-05-25T22:00:00.000Z" -> "2026-05-25"
  return iso.split('T')[0] ?? iso
}

/**
 * Search debe ir sin caracteres especiales de PostgREST. `%` y `_` son
 * wildcards de ilike; `,` rompe el separador de .or(); no permitir
 * literales evita resultados sorpresivos en busqueda textual de Fase 3a.
 * La busqueda parcial sigue funcionando gracias al `%${term}%` que rodea.
 */
function sanitizeSearch(raw: string): string {
  return raw.trim().replace(/[%_,]/g, '')
}

function sortDesc(events: TimelineEvent[]): TimelineEvent[] {
  return events.sort((a, b) => {
    if (a.occurredAt > b.occurredAt) return -1
    if (a.occurredAt < b.occurredAt) return 1
    if (a.id < b.id) return 1
    if (a.id > b.id) return -1
    return 0
  })
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err && typeof err === 'object' && 'name' in err && (err as { name: unknown }).name === 'AbortError') {
    return true
  }
  // Supabase wraps abort en su propio error con .code === '20'? defensive:
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: unknown }).message ?? '')
    if (msg.toLowerCase().includes('abort')) return true
  }
  return false
}

// ─── per-type queries ──────────────────────────────────────────────
//
// Cada funcion:
//   1. Construye la query con order + limit + abortSignal.
//   2. Aplica filtros condicionales (date range, cursor, search).
//   3. Mapea filas via sync adapter -> native type.
//   4. Mapea native type via timeline adapter -> TimelineEvent[].
//
// El tipo de retorno es siempre TimelineEvent[]. Throws en error de red,
// RLS, o cualquier fallo no-abort. AbortError se relanza para que el
// caller lo distinga en Promise.allSettled.

type SbClient = SupabaseClient

async function queryMemoryEvents(
  sb: SbClient, userId: string, filters: TimelineFilters, cursor: TimelineCursor,
  signal: AbortSignal, pageSize: number,
): Promise<TimelineEvent[]> {
  const startIso = dateRangeStartIso(filters)
  const term = sanitizeSearch(filters.search)
  let q = sb
    .from('memories')
    .select('*')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(pageSize)
    .abortSignal(signal)
  if (startIso) q = q.gte('occurred_at', startIso)
  if (cursor)   q = q.lt('occurred_at', cursor)
  if (term)     q = q.or(`title.ilike.%${term}%,content.ilike.%${term}%`)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  return adaptMemories(rows.map((r) => memoryAdapter.fromRow(r)))
}

async function querySelfMetricEvents(
  sb: SbClient, userId: string, filters: TimelineFilters, cursor: TimelineCursor,
  signal: AbortSignal, pageSize: number,
): Promise<TimelineEvent[]> {
  const startIso = dateRangeStartIso(filters)
  const term = sanitizeSearch(filters.search)
  let q = sb
    .from('self_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('measured_at', { ascending: false })
    .limit(pageSize)
    .abortSignal(signal)
  if (startIso) q = q.gte('measured_at', startIso)
  if (cursor)   q = q.lt('measured_at', cursor)
  if (term)     q = q.ilike('note', `%${term}%`)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  return adaptSelfMetrics(rows.map((r) => selfMetricAdapter.fromRow(r)))
}

async function queryHealthMetricEvents(
  sb: SbClient, userId: string, filters: TimelineFilters, cursor: TimelineCursor,
  signal: AbortSignal, pageSize: number,
): Promise<TimelineEvent[]> {
  const startIso = dateRangeStartIso(filters)
  const term = sanitizeSearch(filters.search)
  let q = sb
    .from('health_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('measured_at', { ascending: false })
    .limit(pageSize)
    .abortSignal(signal)
  if (startIso) q = q.gte('measured_at', startIso)
  if (cursor)   q = q.lt('measured_at', cursor)
  if (term)     q = q.ilike('note', `%${term}%`)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  return adaptHealthMetrics(rows.map((r) => healthMetricAdapter.fromRow(r)))
}

async function querySleepEvents(
  sb: SbClient, userId: string, filters: TimelineFilters, cursor: TimelineCursor,
  signal: AbortSignal, pageSize: number,
): Promise<TimelineEvent[]> {
  // sleep_records.date es YYYY-MM-DD; el cursor es ISO timestamp, convertir.
  const startIso = dateRangeStartIso(filters)
  const startDate = startIso ? dateOnlyFromIso(startIso) : null
  const cursorDate = cursor ? dateOnlyFromIso(cursor) : null
  const term = sanitizeSearch(filters.search)
  let q = sb
    .from('sleep_records')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(pageSize)
    .abortSignal(signal)
  if (startDate)  q = q.gte('date', startDate)
  if (cursorDate) q = q.lt('date', cursorDate)
  if (term)       q = q.or(`dreams.ilike.%${term}%,notes.ilike.%${term}%`)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  return adaptSleeps(rows.map((r) => sleepRecordAdapter.fromRow(r)))
}

async function queryFinanceEvents(
  sb: SbClient, userId: string, filters: TimelineFilters, cursor: TimelineCursor,
  signal: AbortSignal, pageSize: number,
): Promise<TimelineEvent[]> {
  // finance_movements.date es YYYY-MM-DD; idem sleep.
  const startIso = dateRangeStartIso(filters)
  const startDate = startIso ? dateOnlyFromIso(startIso) : null
  const cursorDate = cursor ? dateOnlyFromIso(cursor) : null
  const term = sanitizeSearch(filters.search)
  let q = sb
    .from('finance_movements')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(pageSize)
    .abortSignal(signal)
  if (startDate)  q = q.gte('date', startDate)
  if (cursorDate) q = q.lt('date', cursorDate)
  if (term)       q = q.ilike('description', `%${term}%`)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  return adaptFinances(rows.map((r) => financeMovementAdapter.fromRow(r)))
}

async function querySignalEvents(
  sb: SbClient, userId: string, filters: TimelineFilters, cursor: TimelineCursor,
  signal: AbortSignal, pageSize: number,
): Promise<TimelineEvent[]> {
  const startIso = dateRangeStartIso(filters)
  const term = sanitizeSearch(filters.search)
  let q = sb
    .from('signals')
    .select('*')
    .eq('user_id', userId)
    .order('detected_at', { ascending: false })
    .limit(pageSize)
    .abortSignal(signal)
  if (startIso) q = q.gte('detected_at', startIso)
  if (cursor)   q = q.lt('detected_at', cursor)
  if (term)     q = q.or(`content.ilike.%${term}%,meaning.ilike.%${term}%`)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  return adaptSignals(rows.map((r) => signalAdapter.fromRow(r)))
}

async function queryGoalEvents(
  sb: SbClient, userId: string, filters: TimelineFilters, _cursor: TimelineCursor,
  signal: AbortSignal, pageSize: number,
): Promise<TimelineEvent[]> {
  // goals es entity-state: ignoramos cursor server-side, merge client se
  // encarga (volumen bajo). Filtro de rango cubre created_at O updated_at.
  const startIso = dateRangeStartIso(filters)
  const term = sanitizeSearch(filters.search)
  let q = sb
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(pageSize)
    .abortSignal(signal)
  if (startIso) q = q.or(`created_at.gte.${startIso},updated_at.gte.${startIso}`)
  if (term)     q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  return adaptGoals(rows.map((r) => goalAdapter.fromRow(r)))
}

async function queryRelationalEvents(
  sb: SbClient, userId: string, filters: TimelineFilters, cursor: TimelineCursor,
  signal: AbortSignal, pageSize: number,
): Promise<TimelineEvent[]> {
  // relational_event = people creation + historial relacional.
  //
  // Opción B (no-lossy): el historial sale de la tabla append-only
  // `relationship_events` (PRIMARIA: indexada por event_date, capeada a
  // pageSize, con date-range + cursor server-side -> paginación real para
  // Historial Profundo). El JSONB `relationships.history` queda como
  // FALLBACK/respaldo intacto y solo se lee si la tabla está ausente
  // (0021 sin correr aún) o vacía -> cero regresión, cero pérdida.
  //
  // people: entity-state, volumen bajo, sin filtro server-side (lo necesita
  // el adapter para el name lookup y para los person-creation events).
  const startIso = dateRangeStartIso(filters)

  let eventsQ = sb
    .from('relationship_events')
    .select('*')
    .eq('user_id', userId)
    .order('event_date', { ascending: false })
    .limit(pageSize)
    .abortSignal(signal)
  if (startIso) eventsQ = eventsQ.gte('event_date', startIso)
  if (cursor)   eventsQ = eventsQ.lt('event_date', cursor)

  const [peopleSettled, eventsSettled] = await Promise.allSettled([
    sb.from('people').select('*').eq('user_id', userId).abortSignal(signal),
    eventsQ,
  ])

  // people es core: abort se relanza; cualquier otro error también (sin
  // people no hay name lookup ni person events).
  if (peopleSettled.status === 'rejected') throw peopleSettled.reason
  if (peopleSettled.value.error) throw peopleSettled.value.error
  const peopleRows = (peopleSettled.value.data ?? []) as Record<string, unknown>[]
  const people = peopleRows.map((r) => personAdapter.fromRow(r))

  // Historial desde la tabla SOLO si la query resolvió sin error y trajo
  // filas. Si la tabla falta (0021 sin correr -> PostgREST devuelve error en
  // .value.error, no rejection) o vino vacía -> caemos al JSONB. Un abort sí
  // se relanza para que Promise.allSettled del caller lo distinga.
  let relationalEvents: TimelineEvent[] | null = null
  if (eventsSettled.status === 'rejected') {
    if (isAbortError(eventsSettled.reason)) throw eventsSettled.reason
    // error transitorio (red, etc.): caer al JSONB en vez de fallar el tipo.
  } else if (!eventsSettled.value.error) {
    const eventRows = (eventsSettled.value.data ?? []) as Record<string, unknown>[]
    if (eventRows.length > 0) {
      relationalEvents = adaptRelationalEventRows(eventRows, people)
    }
  }

  if (relationalEvents === null) {
    // FALLBACK JSONB (respaldo intacto). Replica el comportamiento previo:
    // unpack completo + filtros client-side (date range + cursor).
    const relsResult = await sb
      .from('relationships')
      .select('*')
      .eq('user_id', userId)
      .abortSignal(signal)
    if (relsResult.error) throw relsResult.error
    const relsRows = (relsResult.data ?? []) as Record<string, unknown>[]
    const relationships = relsRows.map((r) => relationshipAdapter.fromRow(r))
    let jsonbEvents = adaptRelationalHistory(relationships, people)
    if (startIso) jsonbEvents = jsonbEvents.filter((e) => e.occurredAt >= startIso)
    if (cursor)   jsonbEvents = jsonbEvents.filter((e) => e.occurredAt < cursor)
    relationalEvents = jsonbEvents
  }

  // Person creation events (entity-state) + historial (tabla o JSONB).
  let events: TimelineEvent[] = [...adaptPeople(people), ...relationalEvents]

  // Date range aplica a los person events (el historial ya viene filtrado).
  if (startIso) events = events.filter((e) => e.occurredAt >= startIso)

  // Search client-side (title/body/tags) -> preserva match por nombre y topics.
  const term = sanitizeSearch(filters.search).toLowerCase()
  if (term) {
    events = events.filter(
      (e) =>
        e.title.toLowerCase().includes(term) ||
        (e.body?.toLowerCase().includes(term) ?? false) ||
        e.tags.some((t) => t.toLowerCase().includes(term)),
    )
  }
  return events
}

// ─── orchestrator por tipo ─────────────────────────────────────────

function queryByType(
  type: TimelineEventType,
  sb: SbClient,
  userId: string,
  filters: TimelineFilters,
  cursor: TimelineCursor,
  signal: AbortSignal,
  pageSize: number,
): Promise<TimelineEvent[]> {
  switch (type) {
    case 'memory':           return queryMemoryEvents(sb, userId, filters, cursor, signal, pageSize)
    case 'self_metric':      return querySelfMetricEvents(sb, userId, filters, cursor, signal, pageSize)
    case 'health':           return queryHealthMetricEvents(sb, userId, filters, cursor, signal, pageSize)
    case 'sleep':            return querySleepEvents(sb, userId, filters, cursor, signal, pageSize)
    case 'finance':          return queryFinanceEvents(sb, userId, filters, cursor, signal, pageSize)
    case 'signal':           return querySignalEvents(sb, userId, filters, cursor, signal, pageSize)
    case 'goal_event':       return queryGoalEvents(sb, userId, filters, cursor, signal, pageSize)
    case 'relational_event': return queryRelationalEvents(sb, userId, filters, cursor, signal, pageSize)
  }
}

// ─── fetchPage publica ─────────────────────────────────────────────

export interface FetchPageResult {
  events: TimelineEvent[]
  failedTypes: TimelineEventType[]
  /** Si false, no hay mas paginas para los tipos consultados. */
  hasMore: boolean
}

export interface FetchPageArgs {
  filters: TimelineFilters
  cursor: TimelineCursor
  signal: AbortSignal
  pageSize?: number
  /** Si se pasa, en vez de los activos del filtro consulta solo estos
   *  (usado por retryFailed). */
  onlyTypes?: TimelineEventType[]
}

export async function fetchPage({
  filters,
  cursor,
  signal,
  pageSize = TIMELINE_PAGE_SIZE,
  onlyTypes,
}: FetchPageArgs): Promise<FetchPageResult> {
  const types = onlyTypes ?? activeTypes(filters)
  if (types.length === 0) {
    return { events: [], failedTypes: [], hasMore: false }
  }

  const sb = createClient()

  // userId con RLS — defensivo: si no hay sesion, falla rapido.
  // El middleware deberia haber redirigido antes pero defensive depth.
  const { data: authData, error: authError } = await sb.auth.getUser()
  if (authError) throw authError
  const userId = authData?.user?.id
  if (!userId) throw new Error('No authenticated user for timeline query')

  const settled = await Promise.allSettled(
    types.map((t) => queryByType(t, sb, userId, filters, cursor, signal, pageSize)),
  )

  const perType: FetchTypeResult[] = settled.map((r, i) => {
    if (r.status === 'fulfilled') {
      return { type: types[i], ok: true, events: r.value }
    }
    const err = r.reason
    if (isAbortError(err)) {
      return { type: types[i], ok: false, events: [] /* sin error: abort intencional */ }
    }
    return {
      type: types[i],
      ok: false,
      events: [],
      error: err instanceof Error ? err : new Error(String(err)),
    }
  })

  const events: TimelineEvent[] = []
  const failedTypes: TimelineEventType[] = []

  for (const r of perType) {
    if (r.ok) {
      events.push(...r.events)
    } else if (r.error) {
      failedTypes.push(r.type)
    }
  }

  const sorted = sortDesc(events).slice(0, pageSize)
  const hasMore =
    perType.some((r) => r.ok && r.events.length === pageSize) && sorted.length >= pageSize

  // G3: agrupar por captureId SOLO cuando search está vacia. Con search
  // activa, devolvemos rows flat para que el usuario vea matches especificos.
  // sanitizeSearch ya hace trim + strip de chars especiales.
  const finalEvents = sanitizeSearch(filters.search) === ''
    ? groupByCapture(sorted)
    : sorted

  return { events: finalEvents, failedTypes, hasMore }
}

export { DEFAULT_FILTERS }
