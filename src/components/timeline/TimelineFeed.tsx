'use client'
// SIR V2 — TimelineFeed (Fase 3a Issue #70)
// Orquestador: filtros + hook + cards + paginacion + estados vacios.

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { TimelineCard } from './TimelineCard'
import { EmptyState } from './EmptyState'
import { PartialFailureBanner } from './PartialFailureBanner'
import { TimelineFiltersBar } from './TimelineFilters'
import { TimelineFiltersMobile } from './TimelineFiltersMobile'
import { useTimelineQuery } from '@/hooks/useTimelineQuery'
import { DEFAULT_FILTERS, type TimelineFilters } from '@/lib/timeline/types'

function FeedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-label="Cargando historial">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="border border-border rounded-lg p-4 sm:p-5 flex items-start gap-3"
        >
          <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function TimelineFeed() {
  // Filters state — copia local de DEFAULT_FILTERS (Set debe ser nuevo)
  const [filters, setFilters] = useState<TimelineFilters>(() => ({
    ...DEFAULT_FILTERS,
    types: new Set(DEFAULT_FILTERS.types),
  }))

  const {
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
  } = useTimelineQuery(filters)

  // Mobile search input es separado del Sheet (siempre visible)
  function setSearch(value: string) {
    setFilters((prev) => ({ ...prev, search: value }))
  }
  function clearSearch() {
    setSearch('')
  }

  // ─── infinite scroll sentinel ─────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadMore()
          }
        }
      },
      { rootMargin: '300px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  // ─── nowMs anchor ────────────────────────────────────────────────
  // Computado una vez por render. Todas las cards comparten el mismo "ahora",
  // evitando que dos cards del mismo render muestren tiempos relativos
  // distintos. Sin useMemo: el costo es trivial y el dep array confunde a ESLint.
  const nowMs = Date.now()

  // ─── render ──────────────────────────────────────────────────────

  let body: React.ReactNode
  if (loading) {
    body = <FeedSkeleton count={4} />
  } else if (error) {
    body = <EmptyState variant="error" onRetry={reset} />
  } else if (isEmptySearch) {
    body = <EmptyState variant="no-search" query={filters.search.trim()} />
  } else if (isEmptyRange) {
    body = <EmptyState variant="no-range" />
  } else {
    body = (
      <div className="space-y-3">
        {events.map((e) => (
          <TimelineCard key={e.id} event={e} nowMs={nowMs} />
        ))}
        {hasMore && (
          <div ref={sentinelRef} aria-hidden="true" className="h-1" />
        )}
        {loadingMore && <FeedSkeleton count={2} />}
        {!hasMore && events.length > 0 && (
          <div className="text-center text-[11px] font-mono text-muted-foreground/60 py-4">
            · fin del historial ·
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Desktop sticky filters bar (≥lg) */}
      <div className="hidden lg:block sticky top-0 z-30 bg-background pb-4 border-b border-border mb-6">
        <TimelineFiltersBar filters={filters} onChange={setFilters} />
      </div>

      {/* Mobile compact controls */}
      <div className="lg:hidden sticky top-14 z-30 bg-background pb-3 border-b border-border mb-4 space-y-2">
        <div className="relative">
          <Search
            size={14}
            strokeWidth={1.75}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Buscar en el historial…"
            value={filters.search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9 h-9 text-sm"
            aria-label="Buscar en el historial"
          />
          {filters.search.length > 0 && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted"
            >
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
        <TimelineFiltersMobile filters={filters} onChange={setFilters} />
      </div>

      {partialFailure && (
        <PartialFailureBanner
          failedTypes={partialFailure.failedTypes}
          onRetry={partialFailure.retryFailed}
        />
      )}

      {body}
    </div>
  )
}
