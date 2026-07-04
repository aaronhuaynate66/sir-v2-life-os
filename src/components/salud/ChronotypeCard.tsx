'use client'

// SIR V2 — ChronotypeCard (11·M2 + 11·M4): cronotipo + jet-lag social.
// Corre computeChronotype/computeSocialJetlag sobre tus horarios de sueño. Muestra
// dónde cae tu centro de sueño (alondra↔búho) y si el finde te corre el reloj (jet-
// lag social). Honesto: se oculta sin datos suficientes; descriptivo, no etiqueta.

import { useMemo } from 'react'
import { Sunrise } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useSelfStore } from '@/stores/useSelfStore'
import { computeChronotype, computeSocialJetlag } from '@/lib/chrono/chronotype'

const POSITION_LABEL = { alondra: 'alondra (madrugador)', intermedio: 'intermedio', 'búho': 'búho (nocturno)' } as const

export function ChronotypeCard() {
  const { sleepRecords } = useSelfStore()

  const { chrono, jetlag } = useMemo(() => {
    const rows = sleepRecords.map((s) => ({ date: s.date, bedtime: s.bedtime, duration: s.duration }))
    return { chrono: computeChronotype(rows), jetlag: computeSocialJetlag(rows) }
  }, [sleepRecords])

  if (!chrono.sufficient && !jetlag.significant) return null

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Sunrise size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Cronotipo</h2>
        </div>

        {chrono.sufficient && chrono.midSleepLabel && (
          <p className="text-[13px] text-foreground/90 leading-relaxed">
            Tu centro de sueño cae ~<span className="font-mono">{chrono.midSleepLabel}</span> —
            cronotipo <span className="text-foreground">{POSITION_LABEL[chrono.position!]}</span> ({chrono.nights} noches).
            {chrono.unstable && ' Ojo: tus horarios varían mucho, así que es orientativo.'}
          </p>
        )}

        {jetlag.significant && jetlag.message && (
          <p className="text-[12px] text-warn leading-relaxed border-t border-border/40 pt-2">{jetlag.message}</p>
        )}
      </CardContent>
    </Card>
  )
}
