'use client'

// SIR V2 — Predictor forward ciclo → estado (card).
//
// Cierra el gap que el mapa marcó: además del Horizonte (que predice las FASES)
// y la Correlación (descriptiva), esta card PROYECTA el estado hacia adelante:
// "en tu próxima ventana lútea (en ~6 días) el tono de las charlas tiende a
// bajar". Reusa el baseline N-de-1 por fase (buildCyclePhaseForecast).
//
// LÍNEA ÉTICA (doc 17 — CUIDAR, nunca descalificar): la proyección es un
// promedio histórico, no un diagnóstico. El lenguaje es de timing y presencia
// ("baja la intensidad, suma cuidado"), NUNCA "va a estar insoportable". Se
// oculta entero si no hay un patrón real que anticipar.
//
// MOUNT-SAFE (fix #418): depende de "ahora".

import { useMemo } from 'react'
import { TrendingDown, Sparkles } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useMounted } from '@/hooks/useMounted'
import { OriginBadge } from './OriginBadge'
import { pickCyclePhaseForecast, type PhaseForecast } from '@/lib/prediction/cyclePhaseForecast'
import type { PersonLog } from '@/lib/person-logs/types'

const PHASE_VAR: Record<string, string> = {
  Menstrual: '--h-menstrual',
  Folicular: '--h-follicular',
  Ovulación: '--h-ovulation',
  Lútea: '--h-luteal',
}

export interface CyclePhaseForecastCardProps {
  personLogs: PersonLog[]
  cycleStartDate?: string | null
  cycleLengthDays?: number | null
  personName: string
}

export function CyclePhaseForecastCard(props: CyclePhaseForecastCardProps) {
  const mounted = useMounted()
  if (!mounted) return null
  return <ForecastBody {...props} />
}

function fmtDate(dateKey: string): string {
  try {
    return new Date(`${dateKey}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })
  } catch {
    return dateKey
  }
}
function whenPhrase(offset: number): string {
  if (offset <= 0) return 'hoy'
  if (offset === 1) return 'mañana'
  return `en ~${offset} días`
}

function ForecastBody({ personLogs, cycleStartDate, cycleLengthDays, personName }: CyclePhaseForecastCardProps) {
  const forecast = useMemo<PhaseForecast | null>(
    () => pickCyclePhaseForecast({ logs: personLogs, cycleStartDate, cycleLengthDays }, undefined, new Date()),
    [personLogs, cycleStartDate, cycleLengthDays],
  )

  // Sin patrón real por fase → no anticipamos nada (honesto).
  if (!forecast) return null

  const first = (personName || '').trim().split(/\s+/)[0] || personName
  const { nextLow, nextHigh, metricLabel, days } = forecast
  const maxVal = 5

  return (
    <Card className="sir-horizon shadow-none mb-4 border-l-2" style={{ borderLeftColor: 'rgb(var(--h-luteal) / 0.5)' }}>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <TrendingDown size={14} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
          <span className="text-[11px] uppercase tracking-[0.08em] text-text-tertiary font-sans">
            Proyección del ciclo · {metricLabel}
          </span>
          <OriginBadge origin="computed" className="ml-auto" />
        </div>

        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Según tu historial con {first} por fase del ciclo, así tiende a venir el {metricLabel} las próximas semanas.
        </p>

        {/* Tira forward: una barra por día, alto ∝ valor proyectado, color por fase. */}
        <div className="relative flex items-end gap-[2px]" style={{ height: 44 }} aria-hidden="true">
          {days.map((d) => {
            const v = d.predicted
            const h = v != null ? Math.max(6, Math.round((v / maxVal) * 100)) : 8
            const varName = PHASE_VAR[d.phaseLabel] ?? '--h-neutral'
            return (
              <div
                key={d.offset}
                title={`${fmtDate(d.dateKey)} · ${d.phaseLabel}${v != null ? ` · ${v}/5` : ''}`}
                className="flex-1 rounded-sm"
                style={{
                  height: `${h}%`,
                  background: v != null ? `rgb(var(${varName}) / 0.7)` : 'hsl(var(--muted-foreground) / 0.2)',
                  outline: d.offset === 0 ? '1px solid hsl(var(--primary))' : undefined,
                }}
              />
            )
          })}
        </div>

        {/* Las dos ventanas accionables — framing de CUIDADO. */}
        <div className="space-y-2">
          {nextLow && (
            <div className="rounded-md border border-warn/25 bg-warn-soft/50 px-3 py-2 text-[13px]">
              <span className="font-medium text-foreground">Ventana a cuidar · {nextLow.phaseLabel}</span>
              <span className="text-muted-foreground"> — {whenPhrase(nextLow.offset)} ({fmtDate(nextLow.dateKey)})</span>
              <p className="text-muted-foreground leading-relaxed mt-0.5">
                Ahí el {metricLabel} tiende a estar más bajo. Buen momento para bajar la intensidad, sumar presencia y elegir el timing — no para exigir.
              </p>
            </div>
          )}
          {nextHigh && (
            <div className="rounded-md border border-ok/25 bg-ok-soft/50 px-3 py-2 text-[13px]">
              <span className="font-medium text-foreground inline-flex items-center gap-1">
                <Sparkles size={12} strokeWidth={2} aria-hidden="true" /> Buena ventana · {nextHigh.phaseLabel}
              </span>
              <span className="text-muted-foreground"> — {whenPhrase(nextHigh.offset)} ({fmtDate(nextHigh.dateKey)})</span>
              <p className="text-muted-foreground leading-relaxed mt-0.5">
                Ahí el {metricLabel} tiende a estar más alto: más energía y apertura para planes o charlas importantes.
              </p>
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
          Señal <span className="font-medium">{forecast.confidence}</span> · proyección de un promedio histórico
          ({forecast.totalSamples} registros), no una ley ni un diagnóstico — se recalibra con cada dato.
          Cuidado y timing, nunca descalificación.
        </p>
      </CardContent>
    </Card>
  )
}
