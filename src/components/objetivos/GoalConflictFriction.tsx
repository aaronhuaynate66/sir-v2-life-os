'use client'
// SIR V2 — Fricción conflicto↔objetivo en la tarjeta del objetivo (#92).
// Cierra el otro lado del problema de Aaron: "un problema con personas que
// afectan mis objetivos". Si una pelea reciente (tono ≤2) toca este objetivo
// —por la persona vinculada o por el tema (ej. "Mundial")— lo decimos acá, en
// el objetivo, no solo en la ficha de la persona. E5: tu norte roza con tu gente.

import { AlertTriangle } from 'lucide-react'
import type { Person } from '@/types'
import {
  matchConflictsToGoal,
  type RecentConflict,
  type ConflictGoalInput,
} from '@/lib/goals/conflictFriction'

interface Props {
  goal: ConflictGoalInput
  /** Conflictos recientes (sin nombre resuelto). */
  conflicts: { personId: string; value: number; note: string; date: string }[]
  people: Person[]
  /** true si este objetivo es el norte (ancla) — la fricción pesa más. */
  isNorte?: boolean
}

function firstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || name
}

export function GoalConflictFriction({ goal, conflicts, people, isNorte }: Props) {
  const nameById = new Map(people.map((p) => [p.id, p.name]))
  const enriched: RecentConflict[] = conflicts.map((c) => ({
    ...c,
    personName: nameById.get(c.personId) ?? 'alguien',
  }))
  const matches = matchConflictsToGoal(goal, enriched)
  if (matches.length === 0) return null

  // Dedup por persona (la más reciente).
  const seen = new Set<string>()
  const unique = matches.filter((m) => (seen.has(m.personId) ? false : (seen.add(m.personId), true)))
  const names = unique.map((m) => firstName(m.personName))
  const peopleLabel =
    names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} y ${names[1]}` : `${names[0]} y ${names.length - 1} más`

  return (
    <div className="mb-2 flex items-start gap-1.5 rounded-md border border-warn/30 bg-warn-soft/40 px-2 py-1.5 text-[11px]">
      <AlertTriangle size={12} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
      <span className="text-foreground/90 leading-relaxed">
        {isNorte ? 'Tu norte está generando roce' : 'Este objetivo está generando roce'} con{' '}
        <span className="font-medium">{peopleLabel}</span>. Una conversación reciente se tensó por este tema. Cuida el
        vínculo sin resignar el objetivo — mira el briefing de {names.length === 1 ? 'esa persona' : 'esas personas'}.
      </span>
    </div>
  )
}
