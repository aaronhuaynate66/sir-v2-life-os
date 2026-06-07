'use client'
// SIR V2 — Preview editable de los datos de FC extraídos.
//
// El usuario revisa, ajusta valores si Vision falló en algún campo, edita la
// fecha del registro, y confirma. Principio del repo: propuesta editable, nunca
// guardar silencioso. La FC en reposo es el dato clave/verdad; el rango (mín–máx)
// y el promedio son opcionales y se guardan como métricas separadas.

import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, AlertCircle, Heart } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import type { HeartRateCaptureFinal, HeartRatePanelExtracted } from '@/lib/capture/hr/types'
import { resolveHrDay } from '@/lib/capture/hr/map'

interface HeartRateCapturePreviewProps {
  previewUrl: string
  extracted: HeartRatePanelExtracted
  /** Día de fallback ('YYYY-MM-DD', TZ Lima) si el panel no trajo fecha. */
  fallbackDay: string
  saving: boolean
  onCancel: () => void
  onConfirm: (final: HeartRateCaptureFinal) => void
}

const CONFIDENCE_VISUAL: Record<
  HeartRatePanelExtracted['confidence'],
  { Icon: typeof CheckCircle2; class: string; label: string }
> = {
  high: { Icon: CheckCircle2, class: 'text-ok border-ok/30 bg-ok-soft', label: 'alta' },
  medium: { Icon: AlertCircle, class: 'text-warn border-warn/30 bg-warn-soft', label: 'media' },
  low: { Icon: AlertTriangle, class: 'text-bad border-bad/30 bg-bad-soft', label: 'baja' },
}

function numField(v: number | null): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : ''
}

/** Entero >= 0 o null. */
function parseInt0(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

export function HeartRateCapturePreview({
  previewUrl,
  extracted,
  fallbackDay,
  saving,
  onCancel,
  onConfirm,
}: HeartRateCapturePreviewProps) {
  const [day, setDay] = useState<string>(() => resolveHrDay(extracted.date, fallbackDay))
  const [restingRaw, setRestingRaw] = useState<string>(numField(extracted.resting_bpm))
  const [minRaw, setMinRaw] = useState<string>(numField(extracted.min_bpm))
  const [maxRaw, setMaxRaw] = useState<string>(numField(extracted.max_bpm))
  const [avgRaw, setAvgRaw] = useState<string>(numField(extracted.avg_bpm))
  const [highRaw, setHighRaw] = useState<string>(numField(extracted.high_alerts))
  const [lowRaw, setLowRaw] = useState<string>(numField(extracted.low_alerts))

  const visionDetectedDate = extracted.date !== null
  const confidence = CONFIDENCE_VISUAL[extracted.confidence]
  const ConfIcon = confidence.Icon

  // Al menos un valor de FC (reposo / mín / máx / promedio) presente para guardar.
  const hasAnyValue = useMemo(
    () =>
      parseInt0(restingRaw) !== null ||
      parseInt0(minRaw) !== null ||
      parseInt0(maxRaw) !== null ||
      parseInt0(avgRaw) !== null,
    [restingRaw, minRaw, maxRaw, avgRaw],
  )

  const canSave = day.length === 10 && hasAnyValue

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving || !canSave) return
    const final: HeartRateCaptureFinal = {
      day,
      restingBpm: parseInt0(restingRaw),
      minBpm: parseInt0(minRaw),
      maxBpm: parseInt0(maxRaw),
      avgBpm: parseInt0(avgRaw),
      highAlerts: parseInt0(highRaw),
      lowAlerts: parseInt0(lowRaw),
      confidence: extracted.confidence,
    }
    onConfirm(final)
  }

  const restingDetected = typeof extracted.resting_bpm === 'number'

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
                alt="Captura de frecuencia cardíaca"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="hrDay" className="text-xs">
                    Fecha del registro
                  </Label>
                  <Input
                    id="hrDay"
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
                  <Label htmlFor="resting" className="text-xs flex items-center gap-1.5">
                    <Heart size={11} strokeWidth={2} className="text-primary" aria-hidden="true" />
                    FC en reposo
                    <span className="text-muted-foreground/60">(lpm)</span>
                  </Label>
                  <Input
                    id="resting"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={restingRaw}
                    onChange={(e) => setRestingRaw(e.target.value)}
                    disabled={saving}
                    placeholder={restingDetected ? undefined : '—'}
                    className={cn(
                      'mt-1 font-mono tabular-nums',
                      !restingDetected && 'border-dashed',
                    )}
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
                <Label className="text-xs text-muted-foreground/70">Rango del día (lpm)</Label>
                <div className="grid grid-cols-3 gap-3 mt-1">
                  <div>
                    <Label htmlFor="minBpm" className="text-[11px] text-muted-foreground">
                      Mínimo
                    </Label>
                    <Input
                      id="minBpm"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={minRaw}
                      onChange={(e) => setMinRaw(e.target.value)}
                      disabled={saving}
                      placeholder="—"
                      className="mt-1 font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxBpm" className="text-[11px] text-muted-foreground">
                      Máximo
                    </Label>
                    <Input
                      id="maxBpm"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={maxRaw}
                      onChange={(e) => setMaxRaw(e.target.value)}
                      disabled={saving}
                      placeholder="—"
                      className="mt-1 font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <Label htmlFor="avgBpm" className="text-[11px] text-muted-foreground">
                      Promedio
                    </Label>
                    <Input
                      id="avgBpm"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={avgRaw}
                      onChange={(e) => setAvgRaw(e.target.value)}
                      disabled={saving}
                      placeholder="—"
                      className="mt-1 font-mono tabular-nums"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  El rango se guarda aparte (FC mín/máx). Nunca se confunde con la FC en reposo.
                </p>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-3 max-w-sm">
                <div>
                  <Label htmlFor="highAlerts" className="text-xs flex items-center gap-1">
                    Alertas FC alta
                  </Label>
                  <Input
                    id="highAlerts"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={highRaw}
                    onChange={(e) => setHighRaw(e.target.value)}
                    disabled={saving}
                    placeholder="—"
                    className="mt-1 font-mono tabular-nums"
                  />
                </div>
                <div>
                  <Label htmlFor="lowAlerts" className="text-xs flex items-center gap-1">
                    Alertas FC baja
                  </Label>
                  <Input
                    id="lowAlerts"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={lowRaw}
                    onChange={(e) => setLowRaw(e.target.value)}
                    disabled={saving}
                    placeholder="—"
                    className="mt-1 font-mono tabular-nums"
                  />
                </div>
              </div>

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
                parseInt0(restingRaw) !== null ? (
                  <>
                    Vas a guardar tu FC en reposo:{' '}
                    <span className="font-mono tabular-nums text-foreground">
                      {parseInt0(restingRaw)}
                    </span>{' '}
                    lpm.
                  </>
                ) : (
                  'Vas a guardar el rango del día (sin FC en reposo).'
                )
              ) : (
                'Completá la fecha y al menos un valor de FC para guardar.'
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={onCancel} disabled={saving} size="sm">
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !canSave} size="sm">
                {saving ? 'Guardando…' : 'Guardar FC'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
