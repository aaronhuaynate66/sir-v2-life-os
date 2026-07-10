'use client'
// SIR V2 — Segundo horizonte (probabilístico): ventana conductual candidata.
//
// En paralelo al horizonte del ciclo REAL: infiere desde la conducta del chat una
// ventana donde suele aparecer un patrón (fricción/retiro/sensibilidad/somático).
// Cruza su fecha con la del ciclo real. Ético (doc 17): ventana de PATRÓN, no
// período; tendencia, no diagnóstico; coincidencia, no causa; para cuidar.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Waves, RefreshCw, ClipboardCheck } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { cyclePhase } from '@/lib/ciclo/phase'
import { crossHorizons } from '@/lib/ciclo/horizonCross'
import { describeUsualPattern } from '@/lib/forecast-conductual/describe'

interface ForecastRow {
  id: string
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
    recalibration?: { hitRate: number | null; evaluated: number; validated: boolean }
  }
}

const FEEDBACK_CATS: { key: string; label: string }[] = [
  { key: 'periodo', label: 'Período' }, { key: 'pms', label: 'PMS/sensibilidad' },
  { key: 'dolor', label: 'Dolor' }, { key: 'medicacion', label: 'Medicación' },
  { key: 'conflicto', label: 'Conflicto' }, { key: 'distancia', label: 'Distancia/retiro' },
  { key: 'evento_externo', label: 'Evento externo' }, { key: 'no_paso_nada', label: 'No pasó nada' },
]

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

  // Cruce HONESTO: la ventana conductual (patrón SPM/fricción) vs la ventana
  // SPM→período del ciclo real. Rango vs rango — el patrón precede al período, así
  // que comparar centro-vs-día-1 marcaba "difieren" incluso cuando coinciden.
  const cross = useMemo(() => {
    if (!forecast || !realNext) return null
    return crossHorizons({
      behaviorStart: forecast.main_window_start,
      behaviorEnd: forecast.main_window_end,
      behaviorCenter: forecast.center_date,
      nextPeriodIso: realNext,
    })
  }, [forecast, realNext])

  // Patrón usual en prosa cualitativa (reemplaza los chips con "+74%").
  const patternProse = useMemo(() => describeUsualPattern(forecast?.result?.usualPattern), [forecast])

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

            {patternProse && (
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                En esa ventana suele aparecer <span className="text-foreground/90">{patternProse}</span> de lo habitual. Es una tendencia, no algo que vaya a pasar seguro.
              </p>
            )}

            {/* Cruce con el horizonte real (ventana SPM→período vs ventana conductual) */}
            {realNext && cross && (
              <div className="rounded-md border border-border/50 bg-secondary/30 px-3 py-2 text-[12px] leading-relaxed">
                <span className="text-text-tertiary">Cruce · </span>
                SPM→período: <span className="font-mono text-foreground">{fmt(cross.pmsFrom)}–{fmt(cross.pmsTo)}</span> · patrón: <span className="font-mono text-foreground">{fmt(cross.behaviorFrom)}–{fmt(cross.behaviorTo)}</span>
                <span className={cn('block mt-0.5', cross.overlap ? 'text-ok' : 'text-muted-foreground')}>
                  {cross.overlap
                    ? 'Las dos ventanas se solapan — dos señales independientes apuntan a lo mismo. Más razón para acompañar con cuidado.'
                    : `Separadas ~${cross.gapDays}d — tratá cada una como estimación aparte y registrá qué pasa (recalibra el modelo).`}
                </span>
              </div>
            )}

            <div className="text-[11px] text-muted-foreground">
              {forecast.period_days ? `período estimado ~${forecast.period_days}d · ` : ''}
              modelos: {(forecast.dominant_models ?? []).map((m) => MODEL_LABEL[m] ?? m).join(', ') || '—'}
              {forecast.result?.coverage ? ` · ${forecast.result.coverage.activeDays} días activos, ${forecast.result.coverage.peaks} picos` : ''}
            </div>

            {forecast.result?.recalibration && forecast.result.recalibration.evaluated > 0 && (
              <div className="text-[11px] text-muted-foreground">
                aciertos: <span className="text-foreground">{Math.round((forecast.result.recalibration.hitRate ?? 0) * 100)}%</span> ({forecast.result.recalibration.evaluated} ventanas)
                {forecast.result.recalibration.validated && <span className="text-ok"> · validado</span>}
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-muted-foreground border-l-2 border-border/40 pl-3">
              {forecast.interpretation}
            </p>

            <FeedbackBox personId={personId} forecastId={forecast.id} windowCenter={forecast.center_date} onSaved={load} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** "¿Qué pasó en esta ventana?" → registra feedback (recalibra el modelo). */
function FeedbackBox({ personId, forecastId, windowCenter, onSaved }: { personId: string; forecastId: string; windowCenter: string | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [cats, setCats] = useState<Set<string>>(new Set())
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  const toggle = (k: string) => setCats((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })

  async function submit() {
    if (cats.size === 0) { toast.error('Marcá al menos una'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/forecast/feedback', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personId, forecastId, windowCenter, categories: [...cats], eventDate: date || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error('No se pudo registrar', { description: d?.error }); return }
      toast.success(d.anchored ? 'Registrado — fecha guardada como ancla, recalibra el modelo.' : 'Registrado — ajusta el modelo.')
      setCats(new Set()); setDate(''); setOpen(false)
      onSaved()
    } catch { toast.error('No se pudo registrar') } finally { setSaving(false) }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground min-h-[24px]">
        <ClipboardCheck size={13} strokeWidth={1.75} /> ¿Qué pasó en esta ventana?
      </button>
    )
  }
  return (
    <div className="rounded-md border border-border/60 p-3 space-y-2.5">
      <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">¿Qué pasó? (recalibra el modelo)</div>
      <div className="flex flex-wrap gap-1.5">
        {FEEDBACK_CATS.map((c) => (
          <button key={c.key} type="button" onClick={() => toggle(c.key)} aria-pressed={cats.has(c.key)}
            className={cn('rounded-full border px-2.5 py-1 text-[11px] min-h-[28px] transition-colors', cats.has(c.key) ? 'border-brand/50 bg-brand/10 text-brand-soft-foreground' : 'border-border text-muted-foreground hover:border-brand/40')}>
            {c.label}
          </button>
        ))}
      </div>
      {(cats.has('periodo') || cats.has('pms')) && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Fecha (la vuelve ancla):</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="font-mono text-[12px] max-w-[160px]" />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
        <Button size="sm" onClick={submit} disabled={saving}>{saving ? 'Guardando…' : 'Registrar'}</Button>
      </div>
    </div>
  )
}
