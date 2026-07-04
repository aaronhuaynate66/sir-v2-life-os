'use client'

// SIR V2 — RelationalHealthCard (15·3 + 15·6): salud del vínculo.
// Lee tendencia de tono + cadencia vs esperada por capa y da una guía cualitativa
// ramificada afectivo/profesional. Solo aparece cuando hay algo que sugerir (no
// es un dashboard). LÍNEA ÉTICA (doc 15): sin score visible, sin cuota; afectivo
// recibe presencia, jamás lenguaje de gestión.

import { useMemo } from 'react'
import { HeartHandshake } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { assessLinkHealth } from '@/lib/relational/health'
import type { Person } from '@/types'
import type { PersonLog } from '@/lib/person-logs/types'

export function RelationalHealthCard({ person, personLogs }: { person: Person; personLogs: PersonLog[] }) {
  const health = useMemo(() => {
    const interactions = personLogs
      .filter((l) => l.kind === 'interaction')
      .map((l) => ({ quality: l.value, at: l.loggedAt }))
    return assessLinkHealth({
      relationship: person.relationship,
      category: person.category,
      lastContactAt: person.lastContact ?? null,
      interactions,
      personName: person.name,
    })
  }, [person, personLogs])

  // Solo mostramos si hay una sugerencia concreta (oferta descartable).
  if (!health.guidance) return null

  const warm = health.toneTrend === 'warming' && !health.attention
  const accent = warm ? 'text-ok' : 'text-warn'

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-2">
        <div className="flex items-center gap-2">
          <HeartHandshake size={14} strokeWidth={1.75} className={accent} aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Salud del vínculo</h2>
        </div>

        <p className="text-[13px] text-foreground/90 leading-relaxed">{health.guidance}</p>

        {/* Contexto cualitativo, nunca un número/score. */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground/70">
          {health.toneTrend === 'cooling' && <span>tono enfriándose</span>}
          {health.toneTrend === 'warming' && <span>tono en alza</span>}
          {health.cadence === 'overdue' && health.daysSinceContact !== null && (
            <span>hace {health.daysSinceContact}d · más de lo habitual para este vínculo</span>
          )}
          <span>{health.mode === 'affective' ? 'vínculo afectivo' : 'vínculo profesional'}</span>
        </div>
      </CardContent>
    </Card>
  )
}
