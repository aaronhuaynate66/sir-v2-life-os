'use client'

// SIR V2 — EmotionWindowCard (13·M1 + 13·M2): ventana de tolerancia + estrategia.
// Corre el motor puro assessEmotionWindow sobre estrés (self_metrics) + HRV
// (health_metrics) + sueño (sleep_records) y, si estás saliéndote de la ventana,
// sugiere la CLASE de estrategia (Gross): bajar activación primero vs reencuadrar.
// Solo aparece con señal (narrow/watch). NO lee data clínica (13·M5).

import { useMemo } from 'react'
import { Waves } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useSelfStore } from '@/stores/useSelfStore'
import { assessEmotionWindow } from '@/engines/emotion'

export function EmotionWindowCard() {
  const { selfMetrics, healthMetrics, sleepRecords } = useSelfStore()

  const w = useMemo(() => {
    const stress = selfMetrics.filter((m) => m.category === 'stress').map((m) => ({ value: m.value, at: m.timestamp }))
    const hrv = healthMetrics.filter((m) => m.type === 'hrv_avg').map((m) => ({ value: m.value, at: m.timestamp }))
    const sleepHours = sleepRecords.map((s) => ({ value: s.duration, at: s.date }))
    return assessEmotionWindow({ stress, hrv, sleepHours }, Date.now())
  }, [selfMetrics, healthMetrics, sleepRecords])

  if (!w.guidance) return null

  const narrow = w.state === 'narrow'
  const signals = [
    w.stressElevated && 'estrés elevado',
    w.hrvDown && 'HRV en caída',
    w.sleepLow && 'sueño bajo',
  ].filter(Boolean) as string[]

  return (
    <Card className={`shadow-none mb-4 ${narrow ? 'border-bad/40' : 'border-warn/40'}`}>
      <CardContent className="p-4 sm:p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Waves size={14} strokeWidth={1.75} className={narrow ? 'text-bad' : 'text-warn'} aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
            {narrow ? 'Ventana angosta' : 'Ventana tensionada'}
          </h2>
        </div>

        <p className="text-[13px] text-foreground/90 leading-relaxed">{w.guidance}</p>

        {signals.length > 0 && (
          <div className="text-[10px] text-muted-foreground/70">{signals.join(' · ')} (vs. tu promedio)</div>
        )}
      </CardContent>
    </Card>
  )
}
