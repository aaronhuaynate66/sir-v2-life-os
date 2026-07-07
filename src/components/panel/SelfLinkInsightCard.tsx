'use client'

// SIR V2 — SelfLinkInsightCard: el PAYOFF del check-in diario. Corre el motor
// C1-cruzado (N-de-1) sobre tu sueño + tus registros de ánimo/energía y muestra TU
// patrón personal ("dormir mejor te sube la energía al día siguiente"). Cierra el
// loop: registrás → SIR aprende tu patrón → te da una razón para seguir. Si todavía
// no hay pares suficientes, muestra un nudge honesto (cuánto falta), no un vacío.
// Coincidencia, no causa — es tu correlación, no un diagnóstico.

import { useMemo } from 'react'
import { Activity } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useSelfStore } from '@/stores/useSelfStore'
import { analyzeSleepSelfLink, type SleepPoint, type SelfPoint } from '@/lib/prediction/c1/crossSignal'
import { limaDayKey } from '@/lib/dates/limaDay'

const TARGET_LABEL = { energy: 'energía', mood: 'ánimo' } as const

export function SelfLinkInsightCard() {
  const sleepRecords = useSelfStore((s) => s.sleepRecords)
  const selfMetrics = useSelfStore((s) => s.selfMetrics)

  const { links, hasData } = useMemo(() => {
    const sleep: SleepPoint[] = sleepRecords
      .map((r) => ({ day: r.date, score: r.score ?? (typeof r.quality === 'number' ? r.quality * 10 : NaN) }))
      .filter((p) => Number.isFinite(p.score))
    const energy: SelfPoint[] = selfMetrics
      .filter((m) => m.category === 'energy')
      .map((m) => ({ day: limaDayKey(m.timestamp ?? ''), value: m.value }))
    const mood: SelfPoint[] = selfMetrics
      .filter((m) => m.category === 'mood')
      .map((m) => ({ day: limaDayKey(m.timestamp ?? ''), value: m.value }))
    const res = analyzeSleepSelfLink(sleep, energy, mood)
    return { links: res.links, hasData: sleep.length >= 3 && energy.length + mood.length >= 3 }
  }, [sleepRecords, selfMetrics])

  if (!hasData) return null

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Activity size={14} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Lo que SIR va aprendiendo de vos</h2>
        </div>

        {links.length > 0 ? (
          <ul className="space-y-1.5">
            {links.map((l) => (
              <li key={l.target} className="text-sm text-foreground leading-snug">
                Dormir mejor te <span className="font-medium">{l.direction === 'sube' ? 'sube' : 'baja'}</span>{' '}
                {TARGET_LABEL[l.target]} al día siguiente
                <span className="text-muted-foreground">
                  {' '}· r {l.r} · {l.pairs} días · vínculo {l.strength} · conf. {l.confidence}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground leading-snug">
            Todavía faltan días para leer tu patrón sueño↔energía. Seguí registrando: cada día suma un par y lo afina.
          </p>
        )}

        <p className="text-[10px] text-muted-foreground/70 leading-snug">
          Es TU correlación (N-de-1), coincidencia no causa — no un diagnóstico. Se afina con cada registro.
        </p>
      </CardContent>
    </Card>
  )
}
