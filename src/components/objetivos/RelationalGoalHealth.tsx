'use client'
// SIR V2 — Salud del vínculo en la tarjeta de un objetivo RELACIONAL.
// Cierra el hueco: un objetivo "mejorar mi relación con X" mostraba solo el
// progreso manual (KRs, casi siempre 0%) y NO reflejaba que el vínculo con X
// mejora. Acá derivamos la salud del vínculo (score + banda) de la persona
// vinculada — ahora que el score sí incorpora las interacciones marcadas.

import { HeartHandshake } from 'lucide-react'
import type { Person } from '@/types'
import { computeRelationalScore, healthBand, type InteractionEvent } from '@/lib/people/relationalScore'

interface Props {
  personIds: string[]
  people: Person[]
  /** events[personId] = interacciones con fecha (person_logs) → score ponderado. */
  events: Record<string, InteractionEvent[]>
}

function firstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || name
}

export function RelationalGoalHealth({ personIds, people, events }: Props) {
  const linked = personIds.map((id) => people.find((p) => p.id === id)).filter((p): p is Person => !!p)
  if (linked.length === 0) return null

  // Score de cada persona vinculada; mostramos la de PEOR salud (la que más
  // necesita atención para el objetivo).
  const scored = linked
    .map((p) => {
      const b = computeRelationalScore(
        {
          importanceScore: p.importanceScore,
          trustLevel: p.trustLevel,
          lastChatObservedAt: p.lastContact ?? null,
          interactionEvents: events[p.id] ?? [],
        },
        new Date(),
      )
      return { p, global: b.global, band: healthBand(b.global) }
    })
    .sort((a, b) => a.global - b.global)

  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {scored.map(({ p, global, band }) => (
        <span key={p.id} className="inline-flex items-center gap-1.5 text-[11px]">
          <HeartHandshake size={12} style={{ color: band.color }} aria-hidden="true" />
          <span className="text-muted-foreground">Vínculo con {firstName(p.name)}:</span>
          <span className="font-medium" style={{ color: band.color }}>{band.label}</span>
          <span className="font-mono tabular-nums text-muted-foreground">{global}/100</span>
        </span>
      ))}
    </div>
  )
}
