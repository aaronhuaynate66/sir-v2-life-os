'use client'

// SIR V2 — RelationalBidCard (15·5): micro-bid de mantenimiento.
// Sintetiza la señal más fuerte (fecha próxima o tema que le importa) en UN gesto
// concreto y opcional. Complementa (no duplica) los countdowns/temas que ya se
// muestran: acá está la ACCIÓN sintetizada, no la data. Se oculta si no hay señal.

import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { suggestMicroBid } from '@/lib/relational/bid'
import { extractWhatMatters } from '@/lib/people/whatMatters'
import { computeSpecialDateCountdown } from '@/lib/dates/specialDates'
import { useSelfStore } from '@/stores'
import type { Person, Memory } from '@/types'

export function RelationalBidCard({ person, memories }: { person: Person; memories: Memory[] }) {
  const selfName = useSelfStore((s) => s.identityProfile?.fullName ?? '') // excluir autorreferencia
  const bid = useMemo(() => {
    // Fecha especial más cercana (daysUntil >= 0), la mínima.
    const upcoming = (person.specialDates ?? [])
      .map((sd) => computeSpecialDateCountdown(sd))
      .filter((cd): cd is NonNullable<typeof cd> => cd !== null && cd.daysUntil >= 0)
      .sort((a, b) => a.daysUntil - b.daysUntil)[0]

    const { themes, tags } = extractWhatMatters(memories.map((m) => m.content ?? ''), {
      tags: person.tags ?? [],
      excludeName: person.name,
      selfName,
    })
    const topics = [...tags, ...themes.map((t) => t.term)]

    return suggestMicroBid({
      personName: person.name,
      upcoming: upcoming ? { label: upcoming.sd.label, daysUntil: upcoming.daysUntil } : null,
      topics,
    })
  }, [person, memories, selfName])

  if (!bid) return null

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-1.5">
        <div className="flex items-center gap-2">
          <Sparkles size={14} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Un gesto</h2>
        </div>
        <p className="text-[13px] text-foreground/90 leading-relaxed">{bid.text}</p>
        <div className="text-[10px] text-muted-foreground/60">{bid.reason} · opcional, descartable</div>
      </CardContent>
    </Card>
  )
}
