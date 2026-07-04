'use client'

// SIR V2 — SleepQualityCard (SF·F2): la CALIDAD del sueño, no solo las horas.
// Corre el motor puro readSleepQuality sobre la última noche y muestra
// eficiencia + fragmentación + % reparador + score, con un veredicto honesto.
// Si la última noche no trae data rica, lo dice y pide capturar el panel.
// Se oculta sin registros de sueño.

import { useMemo } from 'react'
import { Moon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useSelfStore } from '@/stores/useSelfStore'
import { readSleepQuality, recentQualitySummary, type SleepQualityLabel } from '@/lib/sleep/quality'
import { cn } from '@/lib/utils'

const LABEL_TEXT: Record<SleepQualityLabel, string> = {
  reparador: 'Reparador',
  aceptable: 'Aceptable',
  fragmentado: 'Fragmentado',
  sin_datos: 'Sin datos de calidad',
}

const LABEL_TONE: Record<SleepQualityLabel, string> = {
  reparador: 'text-ok',
  aceptable: 'text-warn',
  fragmentado: 'text-bad',
  sin_datos: 'text-muted-foreground',
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary">{label}</div>
      <div className="text-sm font-mono tabular-nums">{value}</div>
    </div>
  )
}

export function SleepQualityCard() {
  const { sleepRecords } = useSelfStore()

  const { reading, summary, dateLabel } = useMemo(() => {
    const sorted = [...sleepRecords].sort((a, b) => b.date.localeCompare(a.date))
    const last = sorted[0]
    return {
      reading: last ? readSleepQuality(last) : null,
      summary: recentQualitySummary(sleepRecords, Date.now()),
      dateLabel: last?.date ?? null,
    }
  }, [sleepRecords])

  if (!reading || !dateLabel) return null

  const tone = LABEL_TONE[reading.label]

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Moon size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Calidad del sueño</h2>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums">{dateLabel}</span>
        </div>

        <div className={cn('text-2xl font-semibold tracking-tight', tone)}>{LABEL_TEXT[reading.label]}</div>

        {reading.hasRichData ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              {reading.efficiency !== null && (
                <Metric label="Eficiencia" value={`${Math.round(reading.efficiency * 100)}%`} />
              )}
              {reading.fragmentation !== null && (
                <Metric label="Despertares" value={`${reading.awakenings} · ${reading.fragmentation}/h`} />
              )}
              {reading.restorativePct !== null && (
                <Metric label="Reparador" value={`${Math.round(reading.restorativePct * 100)}%`} />
              )}
              {reading.score !== null && <Metric label="Score" value={`${reading.score}/100`} />}
            </div>

            {reading.restorativePct !== null && reading.deepPct !== null && reading.remPct !== null && (
              <p className="text-[12px] text-muted-foreground leading-relaxed mt-3">
                Profundo {Math.round(reading.deepPct * 100)}% · REM {Math.round(reading.remPct * 100)}% del sueño.
                {reading.restorativePct < 0.3 && ' Poca fase profunda/REM: dormiste, pero descansaste menos de lo que dicen las horas.'}
                {reading.restorativePct >= 0.4 && ' Buena proporción de sueño reparador.'}
              </p>
            )}

            {summary.nightsWithData >= 3 && (
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-2 pt-2 border-t border-border/40">
                Últimas 2 semanas ({summary.nightsWithData} noches con datos):
                {summary.avgScore !== null && ` score prom. ${summary.avgScore}/100`}
                {summary.avgEfficiency !== null && ` · eficiencia ${Math.round(summary.avgEfficiency * 100)}%`}
                {summary.avgFragmentation !== null && ` · ${summary.avgFragmentation} despertares/h`}
                {summary.avgRestorativePct !== null && ` · ${Math.round(summary.avgRestorativePct * 100)}% reparador`}.
              </p>
            )}
          </>
        ) : (
          <p className="text-[12px] text-muted-foreground leading-relaxed mt-2">
            De esta noche solo tengo las horas. Capturá el panel de tu app de sueño (Huawei/Apple/Samsung Health)
            desde <span className="text-foreground">Mis capturas</span> para leer eficiencia, despertares y fases —
            no solo cuánto dormiste.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
