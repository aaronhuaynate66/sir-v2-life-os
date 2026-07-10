'use client'
// SIR V2 — "Tu trayectoria" (E5, Life Direction). El arco SOSTENIDO de tus
// objetivos: de todo lo que te propusiste, qué terminás y qué soltás, en qué
// áreas construís, y si esa proporción viene calentando o enfriándose.
// Determinístico (buildTrajectoryArc). No moraliza: soltar es una elección válida.

import { useMemo } from 'react'
import Link from 'next/link'
import { Route, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { useGoalStore } from '@/stores/useGoalStore'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { buildTrajectoryArc, categoryLabelEs, type TrajectoryPattern } from '@/lib/self/trajectoryArc'

const PATTERN_META: Record<TrajectoryPattern, { label: string; color: string }> = {
  building: { label: 'Construyendo', color: '#2dd4a7' },
  steady: { label: 'En equilibrio', color: '#e0a93b' },
  releasing: { label: 'Soltando', color: '#8a8f98' },
  exploring: { label: 'Explorando', color: '#8a8f98' },
  nascent: { label: 'Recién arranca', color: '#8a8f98' },
}

export function TrajectoryArcPanel() {
  const hydrated = useHasHydrated()
  const goals = useGoalStore((s) => s.goals)
  const arc = useMemo(() => buildTrajectoryArc(goals), [goals])

  if (!hydrated) return null
  const meta = PATTERN_META[arc.pattern]

  // Áreas con al menos un resuelto (para mostrar barras de constancia).
  const areas = arc.byCategory.filter((c) => c.followThrough !== null).slice(0, 4)

  return (
    <Card style={{ borderColor: `${meta.color}55` }}>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={Route} label="Tu trayectoria" />
        <p className="mt-1 text-[13px] text-muted-foreground">
          El arco largo: de todo lo que te propusiste, qué venís terminando y qué soltando, en el tiempo.
        </p>

        {arc.total === 0 ? (
          <p className="mt-3 text-[13px] text-muted-foreground">{arc.message}</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
                style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
              >
                {meta.label}
              </span>
              {arc.followThrough !== null && (
                <span className="text-[12px] text-muted-foreground">
                  {Math.round(arc.followThrough * 100)}% de lo resuelto lo cerraste
                </span>
              )}
            </div>

            <p className="mt-2 text-[14px] leading-relaxed text-foreground/90">{arc.message}</p>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
              <span>{arc.active} activo(s)</span>
              <span>{arc.completed} completado(s)</span>
              <span>{arc.paused} pausado(s)</span>
              <span>{arc.abandoned} soltado(s)</span>
            </div>

            {areas.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-border pt-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Constancia por área
                </div>
                {areas.map((c) => {
                  const ftPct = c.followThrough !== null ? Math.round(c.followThrough * 100) : 0
                  return (
                    <div key={c.category} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-[12px] text-foreground/80 capitalize">
                        {categoryLabelEs(c.category)}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${ftPct}%`, backgroundColor: meta.color }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-[11px] font-mono tabular-nums text-muted-foreground">
                        {ftPct}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        <Link
          href="/objetivos"
          className="mt-4 inline-flex items-center gap-1 text-[13px] text-[#14b8a6] hover:underline"
        >
          Ver tus objetivos <ArrowRight size={13} />
        </Link>
      </CardContent>
    </Card>
  )
}
