'use client'
// SIR V2 — Step 3: preview editable de las 13 métricas extraídas.
//
// El usuario revisa, ajusta valores manualmente si Vision falló en algún
// campo, edita la fecha de medición, y confirma. Sólo las métricas con
// valor numérico válido se persisten.

import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react'
// AlertTriangle: warning amber para fecha no detectada por Vision.
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import type { ScaleCaptureExtracted, ScaleMetric } from '@/lib/capture/scale/types'
import { SCALE_METRICS_ORDER, SCALE_METRIC_MAPPING } from '@/lib/capture/scale/types'

interface ScaleCapturePreviewProps {
  previewUrl: string
  extracted: ScaleCaptureExtracted
  saving: boolean
  onCancel: () => void
  onConfirm: (args: { finalMetrics: Partial<Record<ScaleMetric, number>>; measuredAt: string }) => void
}

const CONFIDENCE_VISUAL: Record<
  ScaleCaptureExtracted['confidence'],
  { Icon: typeof CheckCircle2; class: string; label: string }
> = {
  high:   { Icon: CheckCircle2,  class: 'text-ok border-ok/30 bg-ok-soft', label: 'alta' },
  medium: { Icon: AlertCircle,   class: 'text-warn border-warn/30 bg-warn-soft',       label: 'media' },
  low:    { Icon: AlertTriangle, class: 'text-bad border-bad/30 bg-bad-soft',             label: 'baja' },
}

function defaultMeasuredAtLocal(extractedIso: string | null): string {
  const d = extractedIso ? new Date(extractedIso) : new Date()
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 16)
  // datetime-local input necesita 'YYYY-MM-DDTHH:mm' sin segundos ni timezone
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localToIso(local: string): string {
  // 'YYYY-MM-DDTHH:mm' (sin tz) -> toISOString
  const d = new Date(local)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

export function ScaleCapturePreview({
  previewUrl,
  extracted,
  saving,
  onCancel,
  onConfirm,
}: ScaleCapturePreviewProps) {
  const initialFields = useMemo<Record<ScaleMetric, string>>(() => {
    const obj = {} as Record<ScaleMetric, string>
    for (const key of SCALE_METRICS_ORDER) {
      const v = extracted.metrics[key]
      obj[key] = typeof v === 'number' && Number.isFinite(v) ? String(v) : ''
    }
    return obj
  }, [extracted])

  const [fields, setFields] = useState<Record<ScaleMetric, string>>(initialFields)
  const [measuredAtLocal, setMeasuredAtLocal] = useState<string>(
    defaultMeasuredAtLocal(extracted.measured_at),
  )

  /** Vision detectó measured_at exitosamente; si no, mostramos warning amber. */
  const visionDetectedDate = extracted.measured_at !== null

  const confidence = CONFIDENCE_VISUAL[extracted.confidence]
  const ConfIcon = confidence.Icon

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    const finalMetrics: Partial<Record<ScaleMetric, number>> = {}
    for (const key of SCALE_METRICS_ORDER) {
      const raw = fields[key]?.trim()
      if (!raw) continue
      const n = Number(raw)
      if (Number.isFinite(n)) finalMetrics[key] = n
    }
    onConfirm({ finalMetrics, measuredAt: localToIso(measuredAtLocal) })
  }

  const filledCount = useMemo(() => {
    return SCALE_METRICS_ORDER.filter((k) => {
      const v = fields[k]?.trim()
      return v && Number.isFinite(Number(v))
    }).length
  }, [fields])

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
                alt="Captura de báscula"
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
              <div>
                <Label htmlFor="measuredAt" className="text-xs">
                  Fecha de medición
                </Label>
                <Input
                  id="measuredAt"
                  type="datetime-local"
                  value={measuredAtLocal}
                  onChange={(e) => setMeasuredAtLocal(e.target.value)}
                  disabled={saving}
                  className={cn(
                    'mt-1 font-mono tabular-nums',
                    !visionDetectedDate && 'border-warn/40 focus-visible:ring-amber-500/40',
                  )}
                  aria-describedby={visionDetectedDate ? undefined : 'measuredAt-warning'}
                />
                {!visionDetectedDate && (
                  <p
                    id="measuredAt-warning"
                    className="text-[11px] text-warn mt-1 flex items-start gap-1 leading-snug"
                    role="status"
                  >
                    <AlertTriangle
                      size={12}
                      strokeWidth={2}
                      className="flex-shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>
                      No pude leer la fecha de la imagen. Si esta captura no es de hoy,
                      cambiala antes de guardar.
                    </span>
                  </p>
                )}
              </div>

              {extracted.raw_observations && (
                <div className="text-[11px] text-muted-foreground leading-relaxed bg-muted/30 border border-border rounded-md px-3 py-2">
                  <span className="font-mono uppercase tracking-wider text-muted-foreground/70 mr-1">
                    Nota:
                  </span>
                  {extracted.raw_observations}
                </div>
              )}

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SCALE_METRICS_ORDER.map((key) => {
                  const mapping = SCALE_METRIC_MAPPING[key]
                  const detected = extracted.metrics[key]
                  const isDetected = typeof detected === 'number'
                  return (
                    <div key={key}>
                      <Label htmlFor={key} className="text-xs flex items-center gap-1.5">
                        {mapping.label}
                        {mapping.unit && (
                          <span className="text-muted-foreground/60">({mapping.unit})</span>
                        )}
                        {!isDetected && (
                          <span className="text-[9px] font-mono uppercase tracking-wider text-warn/70">
                            no detectado
                          </span>
                        )}
                      </Label>
                      <Input
                        id={key}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={fields[key]}
                        onChange={(e) =>
                          setFields((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        disabled={saving}
                        placeholder={isDetected ? undefined : '—'}
                        className={cn(
                          'mt-1 font-mono tabular-nums',
                          !isDetected && 'border-dashed',
                        )}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">{filledCount}</span> de{' '}
              <span className="font-mono tabular-nums">{SCALE_METRICS_ORDER.length}</span> métricas
              listas para guardar.
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                disabled={saving}
                size="sm"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || filledCount === 0} size="sm">
                {saving ? 'Guardando…' : `Guardar ${filledCount} métrica${filledCount === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
