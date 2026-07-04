'use client'

// SIR V2 — SleepAftermathCard (SF·F3): el cruce sueño → día siguiente.
// Corre el motor puro analyzeSleepAftermath sobre tus noches + tus métricas del
// día siguiente (estrés/energía/ánimo/FC de reposo) y muestra los patrones con
// soporte suficiente. Honesto: si aún no hay noches clasificadas suficientes,
// lo dice en vez de inventar. Se oculta si no hay nada de sueño.

import { useMemo } from 'react'
import { Sunrise } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useSelfStore } from '@/stores/useSelfStore'
import { analyzeSleepAftermath } from '@/lib/sleep/aftermath'

export function SleepAftermathCard() {
  const { sleepRecords, selfMetrics, healthMetrics } = useSelfStore()

  const result = useMemo(
    () => analyzeSleepAftermath(sleepRecords, selfMetrics, healthMetrics),
    [sleepRecords, selfMetrics, healthMetrics],
  )

  // Sin ninguna noche clasificable (buena/mala con datos) no aporta nada útil.
  if (result.nightsClassified === 0) return null

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sunrise size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">El día después</h2>
        </div>

        {result.sufficient ? (
          <div className="space-y-2">
            {result.findings.map((f) => (
              <div key={f.metric} className="flex items-start gap-2">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${f.worseAfterPoor ? 'bg-bad' : 'bg-ok'}`}
                  aria-hidden="true"
                />
                <p className="text-[12.5px] text-foreground/90 leading-relaxed">{f.message}</p>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed pt-1">
              Patrón observado en tu propia data, no una ley. Cruza la calidad de cada noche con cómo te fue al día siguiente.
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Todavía no tengo suficientes noches con calidad clara (~3 buenas y 3 malas) junto a tus métricas del día
            siguiente para cruzar. Seguí capturando el panel de sueño y registrando energía/estrés: cuando haya patrón,
            aparece acá. ({result.goodNights} buenas · {result.poorNights} malas hasta ahora.)
          </p>
        )}
      </CardContent>
    </Card>
  )
}
