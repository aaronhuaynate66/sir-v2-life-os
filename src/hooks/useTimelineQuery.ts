// SIR V2 — useTimelineQuery hook (Fase 3a Issue #70)
//
// Lee fixtures en esta sesion (ver src/lib/timeline/query.ts). Issue #71
// reemplaza esa capa por queries reales contra Supabase sin tocar este
// archivo.
//
// Implementa las 4 constraints obligatorias del ADR 0005 § Implementation
// Notes:
//
//  1. Partial query failure: Promise.allSettled en fetchPage, este hook
//     expone `partialFailure: { failedTypes, retryFailed }`. Los tipos
//     exitosos se preservan; retry no destructivo solo re-fetcha fallidos.
//  2. ISO 8601 validation: vive en los adapters individuales (los items
//     invalidos se skipean con console.warn).
//  3. AbortController para cancelar fetches en vuelo (cambio de filtro,
//     loadMore solapado, unmount).
//  4. Empty states diferenciados: flags `isEmptyRange` vs `isEmptySearch`.
//
// Doble guarda anti-race: AbortController + seq monotonic. La seq garantiza
// que solo el ultimo fetch contribuye state, incluso si el AbortSignal no
// alcanza a frenar la promesa antes de resolverse.

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type TimelineCursor,
  type TimelineEvent,
  type TimelineEventType,
  type TimelineFilters,
  TIMELINE_PAGE_SIZE,
} from '@/lib/timeline/types'
import { fetchPage } from '@/lib/timeline/query'

export interface PartialFailureState {
  failedTypes: TimelineEventType[]
  retryFailed: () => void
}

export interface UseTimelineQueryResult {
  events: TimelineEvent[]
  loading: boolean
  loadingMore: boolean
  error: Error | null
  partialFailure: PartialFailureState | null
  hasMore: boolean
  /** No events AND search vacio. */
  isEmptyRange: boolean
  /** No events AND search activa. */
  isEmptySearch: boolean
  loadMore: () => void
  reset: () => void
}

function filtersToKey(f: TimelineFilters): string {
  return JSON.stringify({
    dateRange: f.dateRange,
    types: [...f.types].sort(),
    search: f.search.trim(),
  })
}

export function useTimelineQuery(filters: TimelineFilters): UseTimelineQueryResult {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [failedTypes, setFailedTypes] = useState<TimelineEventType[]>([])
  const [hasMore, setHasMore] = useState(true)

  // Refs anti-race
  const abortRef = useRef<AbortController | null>(null)
  const seqRef = useRef(0)
  const cursorRef = useRef<TimelineCursor>(null)
  const filtersRef = useRef<TimelineFilters>(filters)

  filtersRef.current = filters

  const filtersKey = useMemo(() => filtersToKey(filters), [filters])

  const runFetch = useCallback(
    async (opts: { cursor: TimelineCursor; onlyTypes?: TimelineEventType[]; isInitial: boolean }) => {
      // Cancelar fetch previo
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const mySeq = ++seqRef.current

      if (opts.isInitial) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      try {
        const result = await fetchPage({
          filters: filtersRef.current,
          cursor: opts.cursor,
          signal: controller.signal,
          onlyTypes: opts.onlyTypes,
        })

        // Race guard: si llego otro fetch despues, descartar
        if (mySeq !== seqRef.current) return
        if (controller.signal.aborted) return

        const onlyRetry = Boolean(opts.onlyTypes)

        setEvents((prev) => {
          if (opts.isInitial) return result.events
          // loadMore o retry: dedupe por id manteniendo el primero
          const merged = onlyRetry ? [...prev, ...result.events] : [...prev, ...result.events]
          const seen = new Set<string>()
          const out: TimelineEvent[] = []
          for (const e of merged) {
            if (seen.has(e.id)) continue
            seen.add(e.id)
            out.push(e)
          }
          // Re-sort: el merge entre old + new puede romper orden si retry trajo eventos viejos
          out.sort((a, b) => (a.occurredAt > b.occurredAt ? -1 : a.occurredAt < b.occurredAt ? 1 : 0))
          return out
        })

        // failedTypes: si fue retry, actualizar solo el subset re-fetched
        setFailedTypes((prev) => {
          if (!onlyRetry) return result.failedTypes
          const stillFailed = new Set(result.failedTypes)
          // mantener los que no se reintentaron
          const untouched = prev.filter((t) => !opts.onlyTypes!.includes(t))
          return [...untouched, ...stillFailed]
        })

        // error total: solo si TODOS los tipos consultados fallaron en fetch inicial
        // (en retry no tocamos error)
        if (!onlyRetry && opts.isInitial) {
          const triedCount = result.failedTypes.length + (result.events.length > 0 ? 1 : 0)
          const totalTypes = filtersRef.current.types.size === 0 ? 8 : filtersRef.current.types.size
          if (result.failedTypes.length === totalTypes && result.events.length === 0) {
            setError(new Error('All timeline queries failed.'))
          } else {
            setError(null)
          }
        }

        // cursor: solo avanza en initial / loadMore (no en retry)
        if (!onlyRetry) {
          const last = result.events[result.events.length - 1]
          if (last) cursorRef.current = last.occurredAt
          setHasMore(result.hasMore)
        }
      } catch (e) {
        if (mySeq !== seqRef.current) return
        if ((e as DOMException)?.name === 'AbortError') return
        setError(e instanceof Error ? e : new Error(String(e)))
      } finally {
        if (mySeq === seqRef.current) {
          if (opts.isInitial) setLoading(false)
          else setLoadingMore(false)
        }
      }
    },
    [],
  )

  // Refetch en cada cambio de filtros
  useEffect(() => {
    cursorRef.current = null
    setEvents([])
    setFailedTypes([])
    setError(null)
    setHasMore(true)
    void runFetch({ cursor: null, isInitial: true })

    return () => {
      abortRef.current?.abort()
    }
    // filtersKey es derivado puro de `filters`; no falta dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, runFetch])

  const loadMore = useCallback(() => {
    if (loadingMore || loading || !hasMore) return
    void runFetch({ cursor: cursorRef.current, isInitial: false })
  }, [loadingMore, loading, hasMore, runFetch])

  const retryFailed = useCallback(() => {
    if (failedTypes.length === 0) return
    void runFetch({
      cursor: cursorRef.current,
      onlyTypes: [...failedTypes],
      isInitial: false,
    })
  }, [failedTypes, runFetch])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    cursorRef.current = null
    setEvents([])
    setFailedTypes([])
    setError(null)
    setHasMore(true)
    void runFetch({ cursor: null, isInitial: true })
  }, [runFetch])

  const partialFailure: PartialFailureState | null = useMemo(
    () => (failedTypes.length > 0 ? { failedTypes, retryFailed } : null),
    [failedTypes, retryFailed],
  )

  const trimmedSearch = filters.search.trim()
  const isEmpty = !loading && !error && events.length === 0
  const isEmptyRange = isEmpty && trimmedSearch === ''
  const isEmptySearch = isEmpty && trimmedSearch !== ''

  return {
    events,
    loading,
    loadingMore,
    error,
    partialFailure,
    hasMore,
    isEmptyRange,
    isEmptySearch,
    loadMore,
    reset,
  }
}

// re-export utilidad para el page
export { TIMELINE_PAGE_SIZE }
