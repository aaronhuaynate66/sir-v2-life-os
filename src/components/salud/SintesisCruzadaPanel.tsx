'use client'
// SIR V2 — Síntesis cruzada (Motor #7): biología × vínculos. Cruza tu sueño/FC
// (cliente) con el tono de tus charlas y tus días de conflicto (server). Misma
// guarda de muestra que Patrones: si no alcanza, no opina. Observación, no predicción.

import { useEffect, useMemo, useState } from 'react'
import { GitMerge } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { useSelfStore } from '@/stores/useSelfStore'
import { dailyAvg, type DayPoint } from '@/lib/patterns/observe'
import { observeCrossDomain } from '@/lib/patterns/crossDomain'

export function SintesisCruzadaPanel() {
  const sleepRecords = useSelfStore((s) => s.sleepRecords)
  const healthMetrics = useSelfStore((s) => s.healthMetrics)
  const [rel, setRel] = useState<{ tone: DayPoint[]; conflictDays: string[] } | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/self/relational-daily')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j && Array.isArray(j.tone)) setRel({ tone: j.tone, conflictDays: j.conflictDays ?? [] }) })
      .catch(() => { /* deja null */ })
    return () => { alive = false }
  }, [])

  const obs = useMemo(() => {
    if (!rel) return []
    const sleepHours = dailyAvg(sleepRecords.map((s) => ({ date: s.date, value: s.duration })))
    const restingHr = dailyAvg(healthMetrics.filter((h) => h.type === 'heart_rate').map((h) => ({ timestamp: h.timestamp, value: h.value })))
    return observeCrossDomain({ sleepHours, restingHr, relTone: rel.tone, conflictDays: new Set(rel.conflictDays) })
  }, [rel, sleepRecords, healthMetrics])

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={GitMerge} label="Tu biología × tus vínculos" />
        {obs.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">
            Todavía no hay muestra suficiente para cruzar tu sueño/FC con el tono de tus charlas y tus conflictos.
            Se llena solo a medida que registrás sueño y vas teniendo interacciones. No inventamos patrones sobre poca data.
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {obs.map((o) => (
              <li key={o.id} className="text-[13.5px] leading-relaxed text-foreground/90">
                {o.text}
                <span className="ml-1 text-[11px] text-muted-foreground">· {o.strength} · n={o.n}</span>
              </li>
            ))}
            <li className="text-[11px] text-muted-foreground pt-1">Observación, no predicción.</li>
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
