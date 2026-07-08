'use client'
// SIR V2 — Segundo horizonte (probabilístico): ventana conductual candidata.
//
// En paralelo al horizonte del ciclo REAL: infiere desde la conducta del chat una
// ventana donde suele aparecer un patrón (fricción/retiro/sensibilidad/somático).
// Cruza su fecha con la del ciclo real. Ético (doc 17): ventana de PATRÓN, no
// período; tendencia, no diagnóstico; coincidencia, no causa; para cuidar.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Waves, RefreshCw } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { cyclePhase } from '@/lib/ciclo/phase'

interface ForecastRow {
  mode: string
  center_date: string | null
  main_window_start: string | null
  main_window_end: string | null
  period_days: number | null
  confidence_label: string
  confidence_score: number
  dominant_models: string[]
  interpretation: string
  result: {
    usualPattern?: { friction: number; withdrawal: number; sensitivity: number; somatic: number }
    coverage?: { activeDays: number; spanDays: number; peaks: number; anchors: number }
  }
}

export interface BehaviorHorizonCardProps {
  personId: string
  personName: string
  cycleStartDate?: string | null
  cycleLengthDays?: number | null
  now: Date
}

function fmt(iso: string): string {
  try { return new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) } catch { return iso }
}
function pct(n: number): string { return `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%` }
const MODEL_LABEL: Record<string, string> = { grid: 'grid periódico', interpeak: 'intervalos', autocorr: 'autocorrelación', harmonic: 'armónica', bayes: 'anclas' }

export function BehaviorHorizonCard({ personId, personName, cycleStartDate, cycleLengthDays, now }: BehaviorHorizonCardProps) {
  const firstName = personName.split(' ')[0] || personName
  const [forecast, setForecast] = useState<ForecastRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/forecast?personId=${encodeURIComponent(personId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setForecast(d?.forecast ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [personId])
  useEffect(load, [load])

  async function run() {
    setRunning(true); setMsg(null)
    try {
      const res = await fetch('/api/forecast', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ personId }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(d?.detail || d?.error || 'No se pudo calcular.'); return }
      setForecast(d.forecast ?? null)
    } catch { setMsg('No se pudo calcular (revisá tu conexión).') } finally { setRunning(false) }
  }

  // Cruce con el ciclo REAL: próximo período estimado por fechas confirmadas.
  const realNext = useMemo(() => {
    if (!cycleStartDate) return null
    const cp = cyclePhase(cycleStartDate.slice(0, 10), cycleLengthDays ?? 28, now)
    return cp?.nextPeriodIso ?? null
  }, [cycleStartDate, cycleLengthDays, now])

  const cross = useMemo(() => {
    if (!forecast?.center_date || !realNext) return null
    const a = Date.parse(`${forecast.center_date}T00:00:00Z`), b = Date.parse(`${realNext}T00:00:00Z`)
    const diff = Math.round(Math.abs(a - b) / 86_400_000)
    return diff
  }, [forecast?.center_date, realNext])

  return (
    <Card className="shadow-none mb-4 border-dashed border-border">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Waves size={15} strokeWidth={1.75} className="text-muted-foreground/80" aria-hidden="true" />
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
              2º horizonte · patrón conductual (probabilístico)
            </span>
          </div>
          <Button size="sm" variant="ghost" onClick={run} disabled={running}>
            <RefreshCw size={13} strokeWidth={1.75} className={cn('mr-1', running && 'animate-spin')} />
            {running ? 'Calculando…' : forecast ? 'Recalcular' : 'Calcular'}
          </Button>
        </div>

        {loading ? (
          <div className="h-16 rounded-md bg-muted/25 animate-pulse" aria-hidden="true" />
        ) : !forecast ? (
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            SIR puede estimar, desde la conversación con {firstName}, una <span className="text-foreground/80">ventana donde suele aparecer un patrón</span> (más fricción, retiro o sensibilidad). No es período — es un patrón conductual. {msg ? <span className="block mt-1 text-warn">{msg}</span> : <>Tocá <span className="font-medium">Calcular</span>.</>}
          </p>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[15px] font-semibold text-foreground">
                {forecast.main_window_start && forecast.main_window_end ? `${fmt(forecast.main_window_start)} — ${fmt(forecast.main_window_end)}` : 'sin ventana clara'}
              </span>
              <span className={cn('text-[11px]', forecast.mode === 'calibrated' ? 'text-ok' : 'text-muted-foreground')}>
                {forecast.mode === 'calibrated' ? 'calibrado (con tus anclas)' : 'exploratorio'} · confianza {forecast.confidence_label}
              </span>
            </div>

            {forecast.result?.usualPattern && (
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {([['fricción', forecast.result.usualPattern.friction], ['retiro', forecast.result.usualPattern.withdrawal], ['sensibilidad', forecast.result.usualPattern.sensitivity], ['somático', forecast.result.usualPattern.somatic]] as [string, number][])
                  .filter(([, v]) => v > 0.05)
                  .map(([k, v]) => (
                    <span key={k} className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{k} <span className="text-warn">{pct(v)}</span></span>
                  ))}
              </div>
            )}

            {/* Cruce con el horizonte real */}
            {realNext && forecast.center_date && (
              <div className="rounded-md border border-border/50 bg-secondary/30 px-3 py-2 text-[12px] leading-relaxed">
                <span className="text-text-tertiary">Cruce · </span>
                real (fechas): <span className="font-mono text-foreground">{fmt(realNext)}</span> · conductual: <span className="font-mono text-foreground">{fmt(forecast.center_date)}</span>
                {cross != null && (
                  <span className={cn('block mt-0.5', cross <= 4 ? 'text-ok' : 'text-muted-foreground')}>
                    {cross <= 4 ? `Coinciden (~${cross}d) — dos señales apuntan a lo mismo.` : `Difieren ~${cross}d — tratá cada una como estimación, registrá qué pasa.`}
                  </span>
                )}
              </div>
            )}

            <div className="text-[11px] text-muted-foreground">
              {forecast.period_days ? `período estimado ~${forecast.period_days}d · ` : ''}
              modelos: {(forecast.dominant_models ?? []).map((m) => MODEL_LABEL[m] ?? m).join(', ') || '—'}
              {forecast.result?.coverage ? ` · ${forecast.result.coverage.activeDays} días activos, ${forecast.result.coverage.peaks} picos` : ''}
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground border-l-2 border-border/40 pl-3">
              {forecast.interpretation} Coincidencia, no causa — nunca una explicación de lo que siente. Es para acompañar con más cuidado, no para gestionar.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
