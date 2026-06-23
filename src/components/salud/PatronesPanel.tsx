'use client'
// SIR V2 — "Patrones observados". Cruza la data que YA tenés (sueño, ánimo,
// energía, estrés, FC, días de migraña) y muestra asociaciones SOLO cuando hay
// muestra suficiente. NO predice: es observación, con el n a la vista.

import { useEffect, useMemo, useState } from 'react'
import { Activity, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSelfStore } from '@/stores/useSelfStore'
import { dailyAvg, observePatterns, type DayPoint } from '@/lib/patterns/observe'

export function PatronesPanel() {
  const { selfMetrics, sleepRecords, healthMetrics } = useSelfStore()
  const [migraineDays, setMigraineDays] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/meds')
        if (!res.ok) return
        const j = (await res.json()) as { intakes?: { taken_at: string }[] }
        const set = new Set<string>((j.intakes ?? []).map((i) => (i.taken_at || '').slice(0, 10)).filter(Boolean))
        if (alive) setMigraineDays(set)
      } catch { /* sin meds: el par migraña simplemente no aparece */ }
    })()
    return () => { alive = false }
  }, [])

  const observations = useMemo(() => {
    const cat = (c: string): DayPoint[] => dailyAvg(selfMetrics.filter((m) => m.category === c).map((m) => ({ timestamp: m.timestamp, value: m.value })))
    const sleepHours = dailyAvg(sleepRecords.map((s) => ({ date: s.date, value: s.duration })))
    const restingHr = dailyAvg(healthMetrics.filter((h) => h.type === 'heart_rate').map((h) => ({ timestamp: h.timestamp, value: h.value })))
    return observePatterns({ sleepHours, mood: cat('mood'), energy: cat('energy'), stress: cat('stress'), restingHr, migraineDays })
  }, [selfMetrics, sleepRecords, healthMetrics, migraineDays])

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Activity size={15} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Patrones observados</div>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3 inline-flex items-start gap-1 leading-snug">
          <Info size={12} className="mt-0.5 shrink-0" /> Observación de tu data, <span className="font-medium text-foreground/80">no predicción</span>. Solo aparecen cruces con suficientes días.
        </p>
        {observations.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">
            Todavía no hay suficientes registros para sacar patrones confiables. Seguí registrando sueño, ánimo y energía — con unas semanas más, SIR empieza a cruzarlos.
          </p>
        ) : (
          <ul className="space-y-2">
            {observations.map((o) => (
              <li key={o.id} className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-foreground leading-relaxed">{o.text}</p>
                  <Badge variant={o.strength === 'clara' ? 'brand' : 'secondary'} className="text-[10px] shrink-0 capitalize">{o.strength}</Badge>
                </div>
                <div className="text-[10px] text-muted-foreground/60 mt-1">basado en {o.n} días</div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
