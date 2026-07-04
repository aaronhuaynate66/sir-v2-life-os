'use client'

// SIR V2 — RelationalEnergyCard (15·4): vínculos que drenan vs energizan.
// Vuelve accionable people.energy_impact (hoy inerte) y lo corrobora con
// self_metrics. Solo aparece si el impacto NO es neutral. LÍNEA ÉTICA (doc 15):
// nombrar el patrón y sugerir manejo, NO "cortar gente".

import { useMemo } from 'react'
import { BatteryLow, BatteryCharging } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useSelfStore } from '@/stores/useSelfStore'
import { readRelationalEnergy } from '@/lib/relational/energy'
import type { Person } from '@/types'
import type { PersonLog } from '@/lib/person-logs/types'

export function RelationalEnergyCard({ person, personLogs }: { person: Person; personLogs: PersonLog[] }) {
  const { selfMetrics } = useSelfStore()

  const read = useMemo(() => {
    const interactionDates = personLogs.filter((l) => l.kind === 'interaction').map((l) => l.loggedAt)
    return readRelationalEnergy({
      energyImpact: person.energyImpact,
      personName: person.name,
      interactionDates,
      selfMetrics: selfMetrics.map((m) => ({ category: m.category, value: m.value, timestamp: m.timestamp })),
    })
  }, [person, personLogs, selfMetrics])

  if (!read.guidance) return null

  const draining = read.impact === 'draining'
  const Icon = draining ? BatteryLow : BatteryCharging
  const accent = draining ? 'text-warn' : 'text-ok'

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Icon size={14} strokeWidth={1.75} className={accent} aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
            {draining ? 'Te drena' : 'Te energiza'}
          </h2>
        </div>

        <p className="text-[13px] text-foreground/90 leading-relaxed">{read.guidance}</p>

        {read.corroborated && (
          <div className="text-[10px] text-muted-foreground/70">
            {draining
              ? `estrés +${read.stressDelta} tras verlo/a`
              : `ánimo +${read.moodDelta} tras verlo/a`}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
