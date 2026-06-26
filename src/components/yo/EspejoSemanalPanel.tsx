'use client'
// SIR V2 — Espejo Semanal (Motor #1). Confronta lo que DECLARASTE querer con lo
// que tu data dice que hiciste en los últimos 7 días. No informa: te devuelve la
// brecha. Determinístico (computeEspejoSemanal); también marca lo que SÍ hiciste.

import { useMemo } from 'react'
import { Eye, AlertTriangle, Check } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { useSelfStore } from '@/stores/useSelfStore'
import { computeEspejoSemanal, type EspejoState, type EspejoSeverity } from '@/lib/self/espejoSemanal'
import { useEspejoRelacional } from '@/hooks/useEspejoRelacional'

const STATE_META: Record<EspejoState, { label: string; color: string }> = {
  alineado: { label: 'Alineado', color: '#2dd4a7' },
  a_medias: { label: 'A medias', color: '#e0a93b' },
  a_la_deriva: { label: 'A la deriva', color: '#e5564c' },
  sin_norte: { label: 'Sin norte', color: '#8a8f98' },
  sin_datos: { label: 'Sin datos', color: '#8a8f98' },
}

const SEV_COLOR: Record<EspejoSeverity, string> = {
  alta: '#e5564c',
  media: '#e0a93b',
  leve: '#8a8f98',
}

export function EspejoSemanalPanel() {
  const goals = useGoalStore((s) => s.goals)
  const steps = useObjectiveStepStore((s) => s.steps)
  const selfMetrics = useSelfStore((s) => s.selfMetrics)
  const sleepRecords = useSelfStore((s) => s.sleepRecords)
  const rel = useEspejoRelacional()

  const espejo = useMemo(
    () => computeEspejoSemanal(goals, steps, sleepRecords, selfMetrics, new Date(), rel),
    [goals, steps, sleepRecords, selfMetrics, rel],
  )
  const meta = STATE_META[espejo.state]

  return (
    <Card style={{ borderColor: `${meta.color}55` }}>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={Eye} label="Espejo de la semana" />

        <div className="mt-2 flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
            style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
          >
            {meta.label}
          </span>
          <span className="text-[12px] text-muted-foreground">últimos {espejo.windowDays} días</span>
        </div>

        <p className="mt-2 text-[14px] leading-relaxed text-foreground/90">{espejo.headline}</p>

        {espejo.gaps.length > 0 && (
          <ul className="mt-3 space-y-2.5">
            {espejo.gaps.map((g) => (
              <li key={g.key} className="flex gap-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: SEV_COLOR[g.severity] }} />
                <div className="text-[13px] leading-snug">
                  <span className="text-foreground/90">{g.label}</span>
                  <span className="text-muted-foreground"> — {g.observed}.</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {espejo.wins.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-border pt-3">
            {espejo.wins.map((w, i) => (
              <div key={i} className="flex gap-2 text-[13px] text-foreground/80">
                <Check size={15} className="mt-0.5 shrink-0" style={{ color: '#2dd4a7' }} />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
