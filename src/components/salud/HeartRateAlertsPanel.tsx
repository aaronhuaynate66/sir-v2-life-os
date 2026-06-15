// SIR V2 — Panel "Alertas de FC elevada" (#90 Fase 1, UX heatmap).
// Mapa de calor estilo calendario (últimas 12 semanas) de los días con alertas
// de FC elevada del wearable. Muestra clusters/rachas de un vistazo. La alerta
// salta con FC elevada sostenida ~10 min EN REPOSO (descarta esfuerzo): es
// activación real — probablemente estrés, no exclusivamente.

'use client'

import { useMemo, useState } from 'react'
import { HeartPulse, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { buildAlertCalendar } from '@/lib/salud/alertHeatmap'
import type { HealthMetric } from '@/types'

interface Props {
  metrics: HealthMetric[]
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function fmt(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/** Color de celda por intensidad (amber). 0 = vacío tenue. */
function cellStyle(count: number, inRange: boolean): React.CSSProperties {
  if (!inRange) return { backgroundColor: 'transparent', opacity: 0.25 }
  if (count <= 0) return { backgroundColor: 'rgba(255,255,255,0.05)' }
  const op = count >= 4 ? 1 : count === 3 ? 0.8 : count === 2 ? 0.6 : 0.4
  return { backgroundColor: `rgba(245, 158, 11, ${op})` }
}

export function HeartRateAlertsPanel({ metrics }: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const cal = useMemo(() => buildAlertCalendar(metrics, today, 12), [metrics, today])
  const [selected, setSelected] = useState<string | null>(null)

  if (cal.summary.totalDays === 0) return null

  const sel = selected
    ? cal.weeks.flat().find((d) => d.iso === selected) ?? null
    : null

  return (
    <Card className="border-amber-500/30 bg-amber-500/[0.03]">
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={HeartPulse} label="Alertas de FC elevada" count={cal.summary.totalDays} />

        {/* Resumen en chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Stat label="Días con alerta" value={String(cal.summary.totalDays)} />
          <Stat label="Alertas totales" value={String(cal.summary.totalAlerts)} />
          {cal.summary.busiestIso && (
            <Stat label="Día pico" value={`${fmt(cal.summary.busiestIso)} · ${cal.summary.busiestCount}`} />
          )}
        </div>

        {/* Mapa de calor: semanas (columnas) × días (filas), lunes arriba */}
        <div className="mt-4 overflow-x-auto">
          <div className="flex gap-[3px]">
            {/* Columna de etiquetas de día */}
            <div className="mr-1 flex flex-col gap-[3px] pt-[14px]">
              {WEEKDAYS.map((w, i) => (
                <span key={i} className="h-[15px] text-[9px] leading-[15px] text-muted-foreground/60">{w}</span>
              ))}
            </div>
            {cal.weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                <span className="h-[11px] text-[9px] leading-[11px] text-muted-foreground/60">{cal.monthLabels[wi]}</span>
                {week.map((day) => (
                  <button
                    key={day.iso}
                    type="button"
                    disabled={!day.inRange || day.count === 0}
                    onClick={() => setSelected(day.iso)}
                    title={`${fmt(day.iso)} · ${day.count} alerta(s)`}
                    className={`h-[15px] w-[15px] rounded-[3px] transition-transform ${day.count > 0 ? 'hover:scale-110 cursor-pointer' : 'cursor-default'} ${selected === day.iso ? 'ring-2 ring-amber-300' : ''}`}
                    style={cellStyle(day.count, day.inRange)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Lectura del día seleccionado */}
        {sel && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[13px] text-foreground">
            {fmt(sel.iso)} — <span className="font-medium">{sel.count} alerta(s)</span> de FC elevada
          </div>
        )}

        {/* Leyenda */}
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>menos</span>
          {[0, 1, 2, 3, 4].map((c) => (
            <span key={c} className="h-[11px] w-[11px] rounded-[2px]" style={cellStyle(c, true)} />
          ))}
          <span>más</span>
        </div>

        {/* Caveat compacto */}
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Info size={12} className="mt-0.5 shrink-0" />
          <span>
            Saltan con FC elevada sostenida ~10 min en reposo (descarta el ejercicio). Es activación real:
            lo más probable es estrés, aunque también la disparan cafeína, dormir poco, deshidratación o estar incubando algo.
          </span>
        </p>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[15px] font-semibold text-foreground">{value}</div>
    </div>
  )
}
