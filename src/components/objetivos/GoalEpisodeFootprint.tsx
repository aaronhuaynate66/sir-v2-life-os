'use client'
// SIR V2 — Footprint del episodio en el objetivo (Paso 3 PR-2). Si el objetivo
// toca un episodio abierto, muestra a cuántas personas alcanza — que SIR diga
// solo que el objetivo no es un capricho, pesa en los vínculos.
import { Radar } from 'lucide-react'
import type { Person } from '@/types'
import { matchEpisodesToGoal, type EpisodeLite } from '@/lib/goals/episodeFriction'

function firstName(n: string): string { return (n || '').trim().split(/\s+/)[0] || n }

export function GoalEpisodeFootprint({ goalTitle, goalDescription, episodes, people }: { goalTitle: string; goalDescription?: string; episodes: EpisodeLite[]; people: Person[] }) {
  const matches = matchEpisodesToGoal(goalTitle, goalDescription, episodes)
  if (matches.length === 0) return null
  const m = matches[0]
  const nameById = new Map(people.map((p) => [p.id, p.name]))
  const names = m.participantIds.map((id) => firstName(nameById.get(id) ?? 'alguien'))
  const label = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} y ${names.length - 3} más`
  return (
    <div className="mb-2 flex items-start gap-1.5 rounded-md border border-brand/30 bg-brand-soft/30 px-2 py-1.5 text-[11px]">
      <Radar size={12} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
      <span className="text-foreground/90 leading-relaxed">
        Esto es un episodio abierto que toca a <span className="font-medium">{m.participantIds.length} {m.participantIds.length === 1 ? 'persona' : 'personas'}</span>{names.length ? `: ${label}` : ''}. No es un capricho — pesa en tus vínculos.
      </span>
    </div>
  )
}
