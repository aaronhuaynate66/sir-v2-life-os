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
import { effectiveCadenceDays } from '@/lib/people/cadence'
import { useSuggestedCadence } from '@/lib/relaciones/useSuggestedCadence'
import type { Person } from '@/types'
import type { PersonLog } from '@/lib/person-logs/types'

import { isNoiseLog } from '@/lib/relational/partnerEffect'

export function RelationalHealthCard({ person, personLogs }: { person: Person; personLogs: PersonLog[] }) {
  // Cadencia esperada rhythm-aware, MISMA fuente que la lista de /relaciones →
  // la "salud del vínculo" de la ficha ya no contradice el overdue de la lista
  // ni del proactivo (antes usaba un default por capa hardcodeado).
  const suggested = useSuggestedCadence()

  const health = useMemo(() => {
    const interactions = personLogs
      .filter((l) => l.kind === 'interaction')
      // Excluir ratings auto-inferidos value=3 (tono de chat/import/llamada): son
      // ruido que aplana el toneTrend hacia 'steady'. Ver isNoiseLog (C2·R1 fix).
      .filter((l) => !isNoiseLog(l.note, l.value))
      .map((l) => ({ quality: l.value, at: l.loggedAt }))
    const expectedDaysOverride = effectiveCadenceDays(
      person.contactFrequency, person.category, suggested[person.id] ?? null,
    ).days
    return assessLinkHealth({
      relationship: person.relationship,
      category: person.category,
      lastContactAt: person.lastContact ?? null,
      interactions,
      personName: person.name,
      expectedDaysOverride,
    })
  }, [person, personLogs, suggested])

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
