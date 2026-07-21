'use client'

// SIR V2 — SleepForecastCard (motor de predicción C1: modelo idiográfico del sueño).
// A diferencia de las cards descriptivas de sueño (deuda, calidad, arquitectura),
// esta es la capa PREDICTIVA: proyecta la próxima noche desde TU propio baseline y
// tendencia (N-de-1, no norma poblacional), con banda y confianza HONESTAS. Es
// orientativo — el sueño depende de lo que hagas hoy, no solo de la tendencia. Se
// oculta si no hay data suficiente (no inventa pronósticos sobre poca data).

import { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useSelfStore } from '@/stores/useSelfStore'
import { analyzeSleep } from '@/lib/prediction/c1/sleepModel'

export function SleepForecastCard() {
  const { sleepRecords } = useSelfStore()
  const c1 = useMemo(() => analyzeSleep(sleepRecords, Date.now()), [sleepRecords])

  // Solo tiene sentido si hay proyección (la parte nueva). Lo descriptivo vive en
  // las otras cards.
  if (!c1.projection || !c1.baseline) return null

  const p = c1.projection
  const trendTxt =
    c1.trend?.direction === 'mejora'
      ? `viene mejorando (+${c1.trend.slopePerWeek}/sem)`
      : c1.trend?.direction === 'empeora'
        ? `viene bajando (${c1.trend.slopePerWeek}/sem)`
        : 'estable'

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-2">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Pronóstico de sueño · N-de-1</h2>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{p.nextScore}</span>
          <span className="text-xs text-muted-foreground">
            esperado esta noche · rango {p.band[0]}–{p.band[1]} · confianza {p.confidence}
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground leading-snug">
          Contra tu baseline personal ({c1.baseline.score} · {c1.baseline.durationH}h), {trendTxt}.
          {c1.trend?.changePoint && (
            <> Tu sueño se {c1.trend.changePoint.direction === 'mejora' ? 'levantó' : 'cortó'} alrededor del{' '}
              {c1.trend.changePoint.dateISO}.</>
          )}
        </p>

        <p className="text-[10px] text-muted-foreground/70 leading-snug">
          Orientativo, no diagnóstico: proyecta tu tendencia, pero lo que duermes depende sobre todo de lo que hagas hoy.
          {' '}Sobre {c1.n} noches.
        </p>
      </CardContent>
    </Card>
  )
}
