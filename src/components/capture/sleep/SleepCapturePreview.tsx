'use client'
// SIR V2 — Preview editable de los datos de sueño extraídos.
//
// El usuario revisa, ajusta valores si Vision falló en algún campo, edita la
// fecha de la noche, y confirma. Principio del repo: propuesta editable, nunca
// guardar silencioso. Las fases se editan en minutos (como las muestra el panel);
// la duración total se deriva de las fases si el usuario la deja vacía.

import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import type { SleepCaptureFinal, SleepPanelExtracted } from '@/lib/capture/sleep/types'
import { resolveSleepDay } from '@/lib/capture/sleep/map'

interface SleepCapturePreviewProps {
  previewUrl: string
  extracted: SleepPanelExtracted
  /** Día de fallback ('YYYY-MM-DD', TZ Lima) si el panel no trajo fecha. */
  fallbackDay: string
  saving: boolean
  onCancel: () => void
  onConfirm: (final: SleepCaptureFinal) => void
}

const CONFIDENCE_VISUAL: Record<
  SleepPanelExtracted['confidence'],
  { Icon: typeof CheckCircle2; class: string; label: string }
> = {
  high: { Icon: CheckCircle2, class: 'text-ok border-ok/30 bg-ok-soft', label: 'alta' },
  medium: { Icon: AlertCircle, class: 'text-warn border-warn/30 bg-warn-soft', label: 'media' },
  low: { Icon: AlertTriangle, class: 'text-bad border-bad/30 bg-bad-soft', label: 'baja' },
}

/** "5 h 55 min" / "55 min" a partir de minutos. */
function fmtHm(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h > 0 && m > 0) return `${h} h ${m} min`
  if (h > 0) return `${h} h`
  return `${m} min`
}

function numField(v: number | null): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : ''
}

function parseMinutes(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

const STAGE_FIELDS = [
  { key: 'deep_minutes', label: 'Profundo' },
  { key: 'light_minutes', label: 'Liviano' },
  { key: 'rem_minutes', label: 'REM' },
  { key: 'awake_minutes', label: 'Vigilia' },
] as const

export function SleepCapturePreview({
  previewUrl,
  extracted,
  fallbackDay,
  saving,
  onCancel,
  onConfirm,
}: SleepCapturePreviewProps) {
  const [day, setDay] = useState<string>(() => resolveSleepDay(extracted.date, fallbackDay))
  const [bedtime, setBedtime] = useState<string>(extracted.bedtime ?? '')
  const [wakeTime, setWakeTime] = useState<string>(extracted.wake_time ?? '')
  const [totalRaw, setTotalRaw] = useState<string>(numField(extracted.total_minutes))
  const [stageRaw, setStageRaw] = useState<Record<string, string>>(() => ({
    deep_minutes: numField(extracted.stages.deep_minutes),
    light_minutes: numField(extracted.stages.light_minutes),
    rem_minutes: numField(extracted.stages.rem_minutes),
    awake_minutes: numField(extracted.stages.awake_minutes),
  }))
  const [scoreRaw, setScoreRaw] = useState<string>(numField(extracted.score))

  const visionDetectedDate = extracted.date !== null
  const confidence = CONFIDENCE_VISUAL[extracted.confidence]
  const ConfIcon = confidence.Icon

  // Total efectivo: el campo si tiene valor; si no, suma de fases dormidas
  // (profundo + liviano + REM, sin vigilia).
  const effectiveTotal = useMemo(() => {
    const explicit = parseMinutes(totalRaw)
    if (explicit !== null && explicit > 0) return explicit
    const deep = parseMinutes(stageRaw.deep_minutes) ?? 0
    const light = parseMinutes(stageRaw.light_minutes) ?? 0
    const rem = parseMinutes(stageRaw.rem_minutes) ?? 0
    return deep + light + rem
  }, [totalRaw, stageRaw])

  const canSave = day.length === 10 && effectiveTotal > 0

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving || !canSave) return
    const score = (() => {
      const t = scoreRaw.trim()
      if (!t) return null
      const n = Number(t)
      return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null
    })()
    const final: SleepCaptureFinal = {
      day,
      totalMinutes: effectiveTotal,
      bedtime: bedtime.trim() || null,
      wakeTime: wakeTime.trim() || null,
      stages: {
        deep_minutes: parseMinutes(stageRaw.deep_minutes),
        light_minutes: parseMinutes(stageRaw.light_minutes),
        rem_minutes: parseMinutes(stageRaw.rem_minutes),
        awake_minutes: parseMinutes(stageRaw.awake_minutes),
      },
      score,
      awakenings: extracted.awakenings,
      respiratoryRate: extracted.respiratory_rate,
      spo2Avg: extracted.spo2_avg,
      napMinutes: extracted.nap_minutes,
      confidence: extracted.confidence,
    }
    onConfirm(final)
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col md:flex-row gap-4 md:gap-6">
            {/* Thumbnail */}
            <div className="flex-shrink-0 flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL no es optimizable por next/image */}
              <img
                src={previewUrl}
                alt="Captura de sueño"
                className="w-40 h-40 md:w-48 md:h-48 object-cover rounded-md border border-border"
              />
              <Badge
                variant="outline"
                className={cn('text-[10px] font-mono uppercase tracking-wider', confidence.class)}
              >
                <ConfIcon size={11} strokeWidth={2} className="mr-1" />
                Confianza {confidence.label}
              </Badge>
            </div>

            {/* Form */}
            <div className="flex-1 min-w-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <Label htmlFor="sleepDay" className="text-xs">
                    Fecha de la noche
                  </Label>
                  <Input
                    id="sleepDay"
                    type="date"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    disabled={saving}
                    className={cn(
                      'mt-1 font-mono tabular-nums',
                      !visionDetectedDate && 'border-warn/40 focus-visible:ring-warn/40',
                    )}
                  />
                </div>
                <div>
                  <Label htmlFor="bedtime" className="text-xs">
                    Hora de dormir
                  </Label>
                  <Input
                    id="bedtime"
                    type="time"
                    value={bedtime}
                    onChange={(e) => setBedtime(e.target.value)}
                    disabled={saving}
                    className="mt-1 font-mono tabular-nums"
                  />
                </div>
                <div>
                  <Label htmlFor="wakeTime" className="text-xs">
                    Hora de despertar
                  </Label>
                  <Input
                    id="wakeTime"
                    type="time"
                    value={wakeTime}
                    onChange={(e) => setWakeTime(e.target.value)}
                    disabled={saving}
                    className="mt-1 font-mono tabular-nums"
                  />
                </div>
              </div>

              {!visionDetectedDate && (
                <p className="text-[11px] text-warn flex items-start gap-1 leading-snug" role="status">
                  <AlertTriangle size={12} strokeWidth={2} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    No pude leer la fecha del panel. Si esta captura no es de hoy, cambiala antes de
                    guardar.
                  </span>
                </p>
              )}

              <div>
                <Label htmlFor="totalMinutes" className="text-xs flex items-center gap-1.5">
                  Duración total
                  <span className="text-muted-foreground/60">(min)</span>
                </Label>
                <Input
                  id="totalMinutes"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={totalRaw}
                  onChange={(e) => setTotalRaw(e.target.value)}
                  disabled={saving}
                  placeholder="Se deriva de las fases si lo dejás vacío"
                  className="mt-1 font-mono tabular-nums"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  = <span className="font-mono tabular-nums">{fmtHm(effectiveTotal)}</span>
                  {parseMinutes(totalRaw) === null && effectiveTotal > 0 && ' (suma de fases)'}
                </p>
              </div>

              <Separator />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {STAGE_FIELDS.map((s) => {
                  const detected = extracted.stages[s.key]
                  const isDetected = typeof detected === 'number'
                  return (
                    <div key={s.key}>
                      <Label htmlFor={s.key} className="text-xs flex items-center gap-1">
                        {s.label}
                        <span className="text-muted-foreground/60">(min)</span>
                      </Label>
                      <Input
                        id={s.key}
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={stageRaw[s.key]}
                        onChange={(e) =>
                          setStageRaw((prev) => ({ ...prev, [s.key]: e.target.value }))
                        }
                        disabled={saving}
                        placeholder={isDetected ? undefined : '—'}
                        className={cn('mt-1 font-mono tabular-nums', !isDetected && 'border-dashed')}
                      />
                    </div>
                  )
                })}
              </div>

              <div className="max-w-[12rem]">
                <Label htmlFor="score" className="text-xs flex items-center gap-1.5">
                  Puntuación
                  <span className="text-muted-foreground/60">(0-100)</span>
                </Label>
                <Input
                  id="score"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="100"
                  step="1"
                  value={scoreRaw}
                  onChange={(e) => setScoreRaw(e.target.value)}
                  disabled={saving}
                  placeholder="—"
                  className="mt-1 font-mono tabular-nums"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Se guarda como calidad 1-10 (la escala de SIR).
                </p>
              </div>

              {(extracted.awakenings !== null || extracted.respiratory_rate !== null || extracted.spo2_avg !== null || extracted.nap_minutes !== null) && (
                <div className="text-[12px] text-foreground/90 bg-muted/30 border border-border rounded-md px-3 py-2 space-y-0.5">
                  <div className="font-mono uppercase tracking-wider text-[10px] text-muted-foreground/70 mb-1">Otros datos del panel</div>
                  {extracted.awakenings !== null && <div>Despertares: <span className="font-medium">{extracted.awakenings}</span></div>}
                  {extracted.nap_minutes !== null && <div>Siesta: <span className="font-medium">{extracted.nap_minutes} min</span> <span className="text-muted-foreground">(aparte del sueño nocturno)</span></div>}
                  {extracted.respiratory_rate !== null && <div>Frecuencia respiratoria: <span className="font-medium">{extracted.respiratory_rate}/min</span> <span className="text-muted-foreground">→ tendencia en Salud</span></div>}
                  {extracted.spo2_avg !== null && <div>SpO₂ promedio: <span className="font-medium">{extracted.spo2_avg}%</span> <span className="text-muted-foreground">→ tendencia en Salud</span></div>}
                </div>
              )}

              {extracted.raw_observations && (
                <div className="text-[11px] text-muted-foreground leading-relaxed bg-muted/30 border border-border rounded-md px-3 py-2">
                  <span className="font-mono uppercase tracking-wider text-muted-foreground/70 mr-1">
                    Nota:
                  </span>
                  {extracted.raw_observations}
                </div>
              )}
            </div>
          </div>

          <Separator className="my-6" />

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {canSave ? (
                <>
                  Vas a guardar{' '}
                  <span className="font-mono tabular-nums">{fmtHm(effectiveTotal)}</span> de sueño.
                </>
              ) : (
                'Completá la fecha y la duración para guardar.'
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={onCancel} disabled={saving} size="sm">
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !canSave} size="sm">
                {saving ? 'Guardando…' : 'Guardar noche'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
