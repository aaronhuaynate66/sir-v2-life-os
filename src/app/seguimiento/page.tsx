'use client'
// SIR V2 — /seguimiento (tablero de trackers)
// Lista de trackers + alertas vivas + detalle por ?t=<id> (deep-link target del
// resumen en objetivos y del email). Crear tracker enganchado a objetivo/paso.

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { LineChart, Plus, ChevronLeft, X } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { useTrackerStore } from '@/stores/useTrackerStore'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { TrackerSummary } from '@/components/trackers/TrackerSummary'
import { TrackerDetail } from '@/components/trackers/TrackerDetail'
import { TrackerAlerts } from '@/components/trackers/TrackerAlerts'
import { CreateTrackerForm } from '@/components/trackers/CreateTrackerForm'

export default function SeguimientoPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={3} />
  return (
    <Suspense fallback={<RouteSkeleton cards={3} />}>
      <SeguimientoContent />
    </Suspense>
  )
}

function SeguimientoContent() {
  const params = useSearchParams()
  const selectedId = params.get('t')

  const trackers = useTrackerStore((s) => s.trackers)
  const points = useTrackerStore((s) => s.points)
  const removeTracker = useTrackerStore((s) => s.removeTracker)
  const goals = useGoalStore((s) => s.goals)
  const steps = useObjectiveStepStore((s) => s.steps)

  const [showCreate, setShowCreate] = useState(false)

  const selected = useMemo(
    () => trackers.find((t) => t.id === selectedId) ?? null,
    [trackers, selectedId],
  )

  function hookLabel(t: { objectiveId?: string; objectiveStepId?: string }): string | null {
    if (t.objectiveStepId) {
      const st = steps.find((s) => s.id === t.objectiveStepId)
      if (st) return st.title
    }
    if (t.objectiveId) {
      const g = goals.find((g) => g.id === t.objectiveId)
      if (g) return g.title
    }
    return null
  }

  return (
    <AppShell>
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">SIR V2</div>
        <div className="flex items-center gap-3 mt-1">
          <LineChart size={28} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Seguimiento</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Métricas externas que monitoreás en el tiempo, con alerta por umbral.
        </p>
      </div>

      {/* DETALLE de un tracker (deep-link ?t=) */}
      {selected ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Link href="/seguimiento" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ChevronLeft size={16} strokeWidth={1.75} /> Todos los trackers
            </Link>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="hover:text-bad">
                  <X size={14} strokeWidth={1.75} /> Eliminar tracker
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar &ldquo;{selected.label}&rdquo;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se borrará el tracker y toda su serie de puntos. No se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Link href="/seguimiento" onClick={() => removeTracker(selected.id)} className="bg-bad text-white hover:bg-bad/90">
                      Eliminar
                    </Link>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {hookLabel(selected) && (
            <p className="text-xs text-muted-foreground">Enganchado a: <span className="text-foreground">{hookLabel(selected)}</span></p>
          )}
          <TrackerDetail tracker={selected} />
        </div>
      ) : (
        <div className="space-y-4">
          <TrackerAlerts />

          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
              Trackers — {trackers.length}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowCreate((v) => !v)}>
              <Plus size={14} strokeWidth={1.75} /> {showCreate ? 'Cerrar' : 'Nuevo tracker'}
            </Button>
          </div>

          {showCreate && (
            <Card>
              <CardContent className="p-4 sm:p-6">
                <CreateTrackerForm onCreated={() => setShowCreate(false)} />
              </CardContent>
            </Card>
          )}

          {trackers.length === 0 ? (
            <EmptyState
              icon={LineChart}
              title="Todavía no seguís ninguna métrica."
              hint='Creá un tracker (ej. "Precio vuelo Lima→Dammam") y subí capturas para armar la serie.'
            />
          ) : (
            <ul className="space-y-2">
              {trackers.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <TrackerSummary tracker={t} points={points} className="flex-1" />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </AppShell>
  )
}
