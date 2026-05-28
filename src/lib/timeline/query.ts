// SIR V2 — Timeline query layer (Fase 3a Issue #70)
//
// Esta capa simula la fetch a Supabase usando fixtures. Issue #71 reemplaza
// `queryByType` por queries reales contra Supabase. La interfaz publica
// `fetchPage` se mantiene; el hook no necesita cambios.

import type {
  FetchTypeResult,
  TimelineCursor,
  TimelineEvent,
  TimelineEventType,
  TimelineFilters,
} from './types'
import { ALL_EVENT_TYPES, TIMELINE_PAGE_SIZE, DEFAULT_FILTERS } from './types'

import { adaptMemories } from './adapters/memory'
import { adaptSelfMetrics } from './adapters/self_metric'
import { adaptHealthMetrics } from './adapters/health_metric'
import { adaptSleeps } from './adapters/sleep'
import { adaptFinances } from './adapters/finance'
import { adaptSignals } from './adapters/signal'
import { adaptGoals } from './adapters/goal'
import { adaptPeople } from './adapters/people'
import { adaptRelationalHistory } from './adapters/relational_event'

import {
  timelineFixtureMemories,
  timelineFixtureSelfMetrics,
  timelineFixtureHealthMetrics,
  timelineFixtureSleepRecords,
  timelineFixtureFinanceMovements,
  timelineFixtureSignals,
  timelineFixtureGoals,
  timelineFixturePeople,
  timelineFixtureRelationships,
  FIXTURE_FAILURE_TRIGGER,
  FIXTURE_FAILED_TYPES_ON_TRIGGER,
} from './fixtures'

// ─── filtros ────────────────────────────────────────────────────────

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

function matchesSearch(events: TimelineEvent[], search: string): TimelineEvent[] {
  const q = search.trim().toLowerCase()
  if (!q) return events
  return events.filter((e) => {
    if (e.title.toLowerCase().includes(q)) return true
    if (e.body && e.body.toLowerCase().includes(q)) return true
    return e.tags.some((tag) => tag.toLowerCase().includes(q))
  })
}

function matchesRange(events: TimelineEvent[], startIso: string | null): TimelineEvent[] {
  if (!startIso) return events
  return events.filter((e) => e.occurredAt >= startIso)
}

function matchesCursor(events: TimelineEvent[], cursor: TimelineCursor): TimelineEvent[] {
  if (!cursor) return events
  return events.filter((e) => e.occurredAt < cursor)
}

function sortDesc(events: TimelineEvent[]): TimelineEvent[] {
  return events.sort((a, b) => {
    if (a.occurredAt > b.occurredAt) return -1
    if (a.occurredAt < b.occurredAt) return 1
    // Tiebreaker estable: id DESC para que la paginacion sea reproducible
    if (a.id < b.id) return 1
    if (a.id > b.id) return -1
    return 0
  })
}

// ─── delay simulado ─────────────────────────────────────────────────

const SIMULATED_DELAY_MS = 220

function delayWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

// ─── per-type query ─────────────────────────────────────────────────

function adaptForType(type: TimelineEventType): TimelineEvent[] {
  switch (type) {
    case 'memory':           return adaptMemories(timelineFixtureMemories)
    case 'self_metric':      return adaptSelfMetrics(timelineFixtureSelfMetrics)
    case 'health':           return adaptHealthMetrics(timelineFixtureHealthMetrics)
    case 'sleep':            return adaptSleeps(timelineFixtureSleepRecords)
    case 'finance':          return adaptFinances(timelineFixtureFinanceMovements)
    case 'signal':           return adaptSignals(timelineFixtureSignals)
    case 'goal_event':       return adaptGoals(timelineFixtureGoals)
    case 'relational_event':
      return [
        ...adaptPeople(timelineFixturePeople),
        ...adaptRelationalHistory(timelineFixtureRelationships, timelineFixturePeople),
      ]
  }
}

const FAIL_TYPES_SET = new Set<TimelineEventType>(FIXTURE_FAILED_TYPES_ON_TRIGGER)

async function queryByType(
  type: TimelineEventType,
  filters: TimelineFilters,
  cursor: TimelineCursor,
  signal: AbortSignal,
  pageSize: number,
): Promise<TimelineEvent[]> {
  await delayWithAbort(SIMULATED_DELAY_MS, signal)

  // Failure simulation deliberada (ver fixtures.ts FIXTURE_FAILURE_TRIGGER)
  if (filters.search.trim() === FIXTURE_FAILURE_TRIGGER && FAIL_TYPES_SET.has(type)) {
    throw new Error(`Simulated failure for type ${type}`)
  }

  const startIso = dateRangeStartIso(filters)
  let pool = adaptForType(type)
  pool = matchesRange(pool, startIso)
  pool = matchesSearch(pool, filters.search)
  pool = sortDesc(pool)
  pool = matchesCursor(pool, cursor)
  return pool.slice(0, pageSize)
}

// ─── fetchPage publica ──────────────────────────────────────────────

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

  const settled = await Promise.allSettled(
    types.map((t) => queryByType(t, filters, cursor, signal, pageSize)),
  )

  const perType: FetchTypeResult[] = settled.map((r, i) => {
    if (r.status === 'fulfilled') {
      return { type: types[i], ok: true, events: r.value }
    }
    const err = r.reason
    const isAbort =
      err instanceof DOMException && err.name === 'AbortError'
    return {
      type: types[i],
      ok: false,
      events: [],
      error: isAbort ? undefined : err instanceof Error ? err : new Error(String(err)),
    }
  })

  const events: TimelineEvent[] = []
  const failedTypes: TimelineEventType[] = []
  let totalReceived = 0

  for (const r of perType) {
    if (r.ok) {
      events.push(...r.events)
      totalReceived += r.events.length
    } else if (r.error) {
      // AbortError NO suma al fallo (intencional)
      failedTypes.push(r.type)
    }
  }

  const sorted = sortDesc(events).slice(0, pageSize)
  // Si todos los OK trajeron < pageSize cada uno, es probable que no haya mas.
  const hasMore =
    perType.some((r) => r.ok && r.events.length === pageSize) && sorted.length >= pageSize

  return { events: sorted, failedTypes, hasMore }
}

// ─── re-export pequenas utilidades para tests/UI ────────────────────

export { DEFAULT_FILTERS }
