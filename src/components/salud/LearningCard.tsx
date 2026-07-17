'use client'
// SIR V2 — "Qué te funciona" (A8, feedback loop). Cierra el bucle: cruza las
// acciones sobre las que actuaste (useFeedbackStore) con tu paz N días después
// (histórico de snapshots) y muestra qué TIPO de acción efectivamente te sube la
// paz. Observación honesta con n a la vista; 'insuficiente' hasta tener outcome.

import { useMemo } from 'react'
import { Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useFeedbackStore } from '@/stores/useFeedbackStore'
import { useSnapshotStore } from '@/stores'
import { computeEffectiveness, type PeacePoint } from '@/engines/learning'
import { useHasHydrated } from '@/hooks/useHasHydrated'

const TYPE_LABEL: Record<string, string> = {
  rest: 'Descanso', connect: 'Conexión', action: 'Acción concreta',
  decision: 'Decisiones', reflect: 'Reflexión', wait: 'Esperar', wait_: 'Esperar',
}

export function LearningCard() {
  const hydrated = useHasHydrated()
  const events = useFeedbackStore((s) => s.events)
  const snapshots = useSnapshotStore((s) => s.snapshots)

  const eff = useMemo(() => {
    if (!hydrated) return []
    const peace: PeacePoint[] = snapshots.map((s) => ({ date: s.date, value: s.peaceScore })).filter((p) => Number.isFinite(p.value))
    return computeEffectiveness(events, peace).filter((e) => e.verdict !== 'insufficient')
  }, [hydrated, events, snapshots])

  if (!hydrated || events.length === 0) return null

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={15} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Qué te funciona</h2>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
          Qué tipo de acción efectivamente te <span className="font-medium text-foreground/80">sube la paz</span> los días después. SIR aprende de lo que haces.
        </p>

        {eff.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">
            SIR está juntando resultados. En unos días, cuando haya paz registrada después de tus acciones, empieza a mostrar qué te funciona.
          </p>
        ) : (
          <ul className="space-y-2">
            {eff.map((e) => {
              const Icon = e.verdict === 'helps' ? TrendingUp : e.verdict === 'hurts' ? TrendingDown : Minus
              const tone = e.verdict === 'helps' ? 'text-ok' : e.verdict === 'hurts' ? 'text-bad' : 'text-muted-foreground'
              return (
                <li key={e.type} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
                  <span className="text-sm text-foreground">{TYPE_LABEL[e.type] ?? e.type}</span>
                  <span className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-sm font-medium ${tone}`}>
                      <Icon size={14} strokeWidth={2} aria-hidden="true" />
                      {e.avgDelta > 0 ? '+' : ''}{e.avgDelta} paz
                    </span>
                    <Badge variant="secondary" className="text-[10px]">n={e.n} · {e.confidence}</Badge>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
