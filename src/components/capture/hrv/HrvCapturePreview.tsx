'use client'
// SIR V2 — Preview editable de los datos de VFC/HRV extraídos (ms).
import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, AlertCircle, Activity } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import type { HrvCaptureFinal, HrvPanelExtracted } from '@/lib/capture/hrv/types'
import { resolveHrvDay } from '@/lib/capture/hrv/map'

interface Props {
  previewUrl: string
  extracted: HrvPanelExtracted
  fallbackDay: string
  saving: boolean
  onCancel: () => void
  onConfirm: (final: HrvCaptureFinal) => void
}

const CONF: Record<HrvPanelExtracted['confidence'], { Icon: typeof CheckCircle2; class: string; label: string }> = {
  high: { Icon: CheckCircle2, class: 'text-ok border-ok/30 bg-ok-soft', label: 'alta' },
  medium: { Icon: AlertCircle, class: 'text-warn border-warn/30 bg-warn-soft', label: 'media' },
  low: { Icon: AlertTriangle, class: 'text-bad border-bad/30 bg-bad-soft', label: 'baja' },
}
const num = (v: number | null): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '')
function parseInt0(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

export function HrvCapturePreview({ previewUrl, extracted, fallbackDay, saving, onCancel, onConfirm }: Props) {
  const [day, setDay] = useState<string>(() => resolveHrvDay(extracted.date, fallbackDay))
  const [restingRaw, setRestingRaw] = useState<string>(num(extracted.resting_ms))
  const [minRaw, setMinRaw] = useState<string>(num(extracted.min_ms))
  const [maxRaw, setMaxRaw] = useState<string>(num(extracted.max_ms))
  const [avgRaw, setAvgRaw] = useState<string>(num(extracted.avg_ms))

  const conf = CONF[extracted.confidence]
  const ConfIcon = conf.Icon
  const visionDate = extracted.date !== null
  const hasAny = useMemo(
    () => parseInt0(restingRaw) !== null || parseInt0(minRaw) !== null || parseInt0(maxRaw) !== null || parseInt0(avgRaw) !== null,
    [restingRaw, minRaw, maxRaw, avgRaw],
  )
  const canSave = day.length === 10 && hasAny

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving || !canSave) return
    onConfirm({
      day,
      restingMs: parseInt0(restingRaw),
      minMs: parseInt0(minRaw),
      maxMs: parseInt0(maxRaw),
      avgMs: parseInt0(avgRaw),
      confidence: extracted.confidence,
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col md:flex-row gap-4 md:gap-6">
            <div className="flex-shrink-0 flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Captura de VFC" className="w-40 h-40 md:w-48 md:h-48 object-cover rounded-md border border-border" />
              <Badge variant="outline" className={cn('text-[10px] font-mono uppercase tracking-wider', conf.class)}>
                <ConfIcon size={11} strokeWidth={2} className="mr-1" />
                Confianza {conf.label}
              </Badge>
            </div>
            <div className="flex-1 min-w-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="hrvDay" className="text-xs">Fecha del registro</Label>
                  <Input id="hrvDay" type="date" value={day} onChange={(e) => setDay(e.target.value)} disabled={saving}
                    className={cn('mt-1 font-mono tabular-nums', !visionDate && 'border-warn/40 focus-visible:ring-warn/40')} />
                </div>
                <div>
                  <Label htmlFor="hrvResting" className="text-xs flex items-center gap-1.5">
                    <Activity size={11} strokeWidth={2} className="text-primary" aria-hidden="true" />
                    VFC en reposo <span className="text-muted-foreground/60">(ms)</span>
                  </Label>
                  <Input id="hrvResting" type="number" inputMode="numeric" min="0" step="1" value={restingRaw}
                    onChange={(e) => setRestingRaw(e.target.value)} disabled={saving} placeholder="—"
                    className="mt-1 font-mono tabular-nums" />
                </div>
              </div>
              {!visionDate && (
                <p className="text-[11px] text-warn flex items-start gap-1 leading-snug" role="status">
                  <AlertTriangle size={12} strokeWidth={2} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>No pude leer la fecha del panel. Si no es de hoy, cambiala antes de guardar.</span>
                </p>
              )}
              <div>
                <Label className="text-xs text-muted-foreground/70">Rango VFC del día (ms)</Label>
                <div className="grid grid-cols-3 gap-3 mt-1">
                  <div>
                    <Label htmlFor="hrvMin" className="text-[11px] text-muted-foreground">Mínimo</Label>
                    <Input id="hrvMin" type="number" inputMode="numeric" min="0" step="1" value={minRaw}
                      onChange={(e) => setMinRaw(e.target.value)} disabled={saving} placeholder="—" className="mt-1 font-mono tabular-nums" />
                  </div>
                  <div>
                    <Label htmlFor="hrvMax" className="text-[11px] text-muted-foreground">Máximo</Label>
                    <Input id="hrvMax" type="number" inputMode="numeric" min="0" step="1" value={maxRaw}
                      onChange={(e) => setMaxRaw(e.target.value)} disabled={saving} placeholder="—" className="mt-1 font-mono tabular-nums" />
                  </div>
                  <div>
                    <Label htmlFor="hrvAvg" className="text-[11px] text-muted-foreground">Promedio</Label>
                    <Input id="hrvAvg" type="number" inputMode="numeric" min="0" step="1" value={avgRaw}
                      onChange={(e) => setAvgRaw(e.target.value)} disabled={saving} placeholder="—" className="mt-1 font-mono tabular-nums" />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">VFC en milisegundos — métrica distinta de la FC (bpm). Nunca se mezclan.</p>
              </div>
              {extracted.raw_observations && (
                <div className="text-[11px] text-muted-foreground leading-relaxed bg-muted/30 border border-border rounded-md px-3 py-2">
                  <span className="font-mono uppercase tracking-wider text-muted-foreground/70 mr-1">Nota:</span>
                  {extracted.raw_observations}
                </div>
              )}
            </div>
          </div>
          <Separator className="my-6" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {canSave ? 'Vas a guardar tu VFC (ms).' : 'Completá la fecha y al menos un valor de VFC para guardar.'}
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={onCancel} disabled={saving} size="sm">Cancelar</Button>
              <Button type="submit" disabled={saving || !canSave} size="sm">{saving ? 'Guardando…' : 'Guardar VFC'}</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
