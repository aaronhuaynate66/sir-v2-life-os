'use client'

// SIR V2 — RelationalEnergyCard (15·4, revivida): ¿esta persona te energiza o te
// drena? Antes leía people.energy_impact (flag MUERTO: 100% neutral). Ahora usa
// el efecto REAL estimado por partnerEffect (C2·R1) desde tus ratings de
// interacción, con empirical-Bayes shrinkage (los vínculos con pocos datos se
// encogen hacia la media → sin falsos positivos). Se oculta si la persona es
// neutral o no hay señal.
//
// LÍNEA ÉTICA (doc 15): nombrar el patrón para MANEJARLO (cuidar tu estado,
// espaciar, apoyarte), NUNCA para descartar gente.

import { useEffect, useState } from 'react'
import { BatteryLow, BatteryCharging } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { OriginBadge } from './OriginBadge'
import type { Person } from '@/types'

interface PersonEffect {
  personId: string
  label: 'energiza' | 'drena' | 'neutral'
  confidence: 'baja' | 'media' | 'alta'
  n: number
  vsBaseline: number
  trend: 'sube' | 'baja' | 'estable' | null
}

export function RelationalEnergyCard({ person }: { person: Person }) {
  const [effect, setEffect] = useState<PersonEffect | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/relational/partner-effects?person=${encodeURIComponent(person.id)}`)
        if (!res.ok) return
        const j = (await res.json()) as { effect?: PersonEffect | null }
        if (!cancelled && j.effect) setEffect(j.effect)
      } catch {
        // best-effort: sin señal, no aparece.
      }
    })()
    return () => { cancelled = true }
  }, [person.id])

  // Solo aparece si hay una dirección real (no neutral).
  if (!effect || effect.label === 'neutral') return null

  const draining = effect.label === 'drena'
  const first = (person.name || '').trim().split(/\s+/)[0] || 'esta persona'
  const Icon = draining ? BatteryLow : BatteryCharging
  const accent = draining ? 'text-warn' : 'text-ok'
  const strong = effect.confidence === 'alta' || effect.confidence === 'media'

  const guidance = draining
    ? `${first} tiende a drenarte${strong ? ' (se nota en tus ratings de interacción)' : ''}. No es para alejarte — cuidá tu estado antes de verlo/a y date permiso de espaciar o poner un límite, sin culpa aunque el vínculo importe.`
    : `${first} te sube el ánimo${strong ? ' (se nota en tus ratings)' : ''}. Cuando andes bajo, apoyarte en ese vínculo suele valer más que aguantar solo/a.`

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon size={14} strokeWidth={1.75} className={accent} aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
            {draining ? 'Te drena' : 'Te energiza'}
          </h2>
          <span className="text-[10px] text-muted-foreground">· confianza {effect.confidence}</span>
          <OriginBadge origin="computed" className="ml-auto" />
        </div>

        <p className="text-[13px] text-foreground/90 leading-relaxed">{guidance}</p>

        <div className="text-[10px] text-muted-foreground/70">
          Estimado de tus {effect.n} {effect.n === 1 ? 'rating' : 'ratings'}, ajustado por lo escaso de la muestra
          {effect.trend && effect.trend !== 'estable' ? ` · viene ${effect.trend === 'sube' ? 'mejorando' : 'bajando'}` : ''}.
        </div>
      </CardContent>
    </Card>
  )
}
