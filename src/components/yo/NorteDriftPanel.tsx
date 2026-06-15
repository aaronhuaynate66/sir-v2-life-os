'use client'
// SIR V2 — "¿Vas hacia tu norte?" (E5). Lee tus objetivos y dice si tu energía
// reciente converge en el norte (objetivo-ancla) o se dispersa. Determinístico.

import { useMemo } from 'react'
import Link from 'next/link'
import { Compass, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { useGoalStore } from '@/stores/useGoalStore'
import { computeNorteDrift, type NorteDriftState } from '@/lib/self/norteDrift'

const STATE_META: Record<NorteDriftState, { label: string; color: string }> = {
  enfocado: { label: 'Enfocado', color: '#2dd4a7' },
  a_medias: { label: 'A medias', color: '#e0a93b' },
  disperso: { label: 'Disperso', color: '#e5564c' },
  estancado: { label: 'Estancado', color: '#e5564c' },
  sin_norte: { label: 'Sin norte', color: '#8a8f98' },
}

export function NorteDriftPanel() {
  const goals = useGoalStore((s) => s.goals)
  const drift = useMemo(() => computeNorteDrift(goals), [goals])
  const meta = STATE_META[drift.state]

  return (
    <Card style={{ borderColor: `${meta.color}55` }}>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={Compass} label="¿Vas hacia tu norte?" />

        <div className="mt-2 flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
            style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
          >
            {meta.label}
          </span>
          {drift.norteProgress !== null && (
            <span className="text-[12px] text-muted-foreground">norte al {drift.norteProgress}%</span>
          )}
        </div>

        <p className="mt-2 text-[14px] leading-relaxed text-foreground/90">{drift.message}</p>

        {drift.state !== 'sin_norte' && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            {drift.daysSinceTouch !== null && <span>último avance del norte: hace {drift.daysSinceTouch} día(s)</span>}
            <span>frentes activos en paralelo: {drift.activeOthers}</span>
          </div>
        )}

        <Link href="/objetivos" className="mt-3 inline-flex items-center gap-1 text-[13px] text-[#14b8a6] hover:underline">
          {drift.state === 'sin_norte' ? 'Fijar tu norte' : 'Ver tus objetivos'} <ArrowRight size={13} />
        </Link>
      </CardContent>
    </Card>
  )
}
