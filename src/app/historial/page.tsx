'use client'
// SIR V2 — /timeline (Fase 3a Issue #70)
// Vista de exploracion temporal del historial del usuario. En esta sesion
// lee de fixtures mock (ver src/lib/timeline/fixtures.ts). Issue #71 conecta
// con Supabase real sin tocar la UI ni el hook.

import { History } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { TimelineFeed } from '@/components/timeline/TimelineFeed'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'

export default function TimelinePage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={4} wide />
  return <TimelineContent />
}

function TimelineContent() {
  return (
    <AppShell wide>
      <header className="mb-6 sm:mb-8">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-sans mb-1">
          SIR V2 &mdash; Vista longitudinal
        </div>
        <div className="flex items-center gap-3">
          <History size={20} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Historial</h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Explora tus eventos en orden cronológico: memorias, métricas, sueño, finanzas,
          señales, objetivos y relaciones. Filtrá por rango, tipo o búsqueda textual.
        </p>
      </header>

      <TimelineFeed />
    </AppShell>
  )
}
