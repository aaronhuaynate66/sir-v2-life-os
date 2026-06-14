'use client'
// SIR V2 — QuickStateLog: registro de estado de UN TAP en Mission Control.
//
// E3-2 (cerrar Behavioral): bajar la fricción de registrar ánimo/energía para
// que el analytics deje de estar hambriento de datos. Escribe a self_metrics
// (la tabla del "yo"), igual que /salud, pero donde el usuario aterriza y sin
// formulario. Si ya registró hoy, lo muestra hecho (sin re-spamear).

import { useState } from 'react'
import { Smile, Zap, Check } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useSelfStore } from '@/stores/useSelfStore'
import { useMemoryStore } from '@/stores'
import { createSelfMetricMemory } from '@/engines/memory'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { track, EVENTS } from '@/lib/analytics/track'
import type { MetricCategory } from '@/types'

const TODAY = () => new Date().toISOString().slice(0, 10)
const LEVELS = [1, 2, 3, 4, 5] // se guarda value = nivel*2 (escala 0-10 de self_metrics)

const ROWS: { category: MetricCategory; label: string; Icon: typeof Smile }[] = [
  { category: 'mood', label: 'Ánimo', Icon: Smile },
  { category: 'energy', label: 'Energía', Icon: Zap },
]

export function QuickStateLog() {
  const hydrated = useHasHydrated()
  const selfMetrics = useSelfStore((s) => s.selfMetrics)
  const addSelfMetric = useSelfStore((s) => s.addSelfMetric)
  const addMemory = useMemoryStore((s) => s.addMemory)
  const [justLogged, setJustLogged] = useState<Record<string, number>>({})

  function loggedTodayValue(category: MetricCategory): number | null {
    const today = TODAY()
    const hit = selfMetrics.find(
      (m) => m.category === category && (m.timestamp ?? '').slice(0, 10) === today,
    )
    return hit ? hit.value : (justLogged[category] ?? null)
  }

  function log(category: MetricCategory, level: number) {
    const metric = {
      id: 'm_' + Date.now(),
      category,
      value: level * 2,
      timestamp: new Date().toISOString(),
    }
    addSelfMetric(metric)
    addMemory(createSelfMetricMemory(metric))
    track(EVENTS.moodLogged, { category, source: 'quicklog' })
    setJustLogged((p) => ({ ...p, [category]: metric.value }))
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">¿Cómo venís hoy?</p>
        {ROWS.map(({ category, label, Icon }) => {
          const current = hydrated ? loggedTodayValue(category) : null
          const done = current !== null
          return (
            <div key={category} className="flex items-center gap-3">
              <span className="flex w-20 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                <Icon className="h-4 w-4" /> {label}
              </span>
              {done ? (
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  <Check className="h-4 w-4 text-[#22c55e]" /> Registrado · {current}/10
                </span>
              ) : (
                <div className="flex gap-1.5">
                  {LEVELS.map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => log(category, lvl)}
                      className={cn(
                        'h-8 w-8 rounded-md border border-border text-sm text-foreground/80',
                        'hover:border-foreground/40 hover:bg-foreground/5 transition-colors',
                      )}
                      aria-label={`${label} nivel ${lvl} de 5`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
