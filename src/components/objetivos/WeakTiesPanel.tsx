'use client'

// SIR V2 — 15·7 (lazos débiles de Granovetter). Para cada objetivo activo, resalta
// los CONOCIDOS (capas network/peripheral) cuyo dominio toca el objetivo — los
// lazos débiles que abren puertas nuevas. Invisible si ningún objetivo tiene lazos
// débiles relevantes. Corre el motor puro weakTiesForGoal sobre goals + people.
import { useMemo } from 'react'
import Link from 'next/link'
import { Waypoints } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { weakTiesForGoal, type WeakTiePerson, type WeakTie } from '@/lib/relational/network'
import type { Goal, Person } from '@/types'

interface GoalTies {
  goalId: string
  goalTitle: string
  ties: WeakTie[]
}

export function WeakTiesPanel({ goals, people }: { goals: Goal[]; people: Person[] }) {
  const netPeople = useMemo<WeakTiePerson[]>(
    () =>
      people.map((p) => ({
        id: p.id, name: p.name, category: p.category,
        title: p.title ?? null, organization: p.organization ?? null,
        tags: p.tags, importance: p.importanceScore,
      })),
    [people],
  )

  const byGoal = useMemo<GoalTies[]>(() => {
    const out: GoalTies[] = []
    for (const g of goals) {
      if (g.status !== 'active') continue
      const ties = weakTiesForGoal(g.title, netPeople, { limit: 4 })
      if (ties.length > 0) out.push({ goalId: g.id, goalTitle: g.title, ties })
    }
    return out
  }, [goals, netPeople])

  if (byGoal.length === 0) return null

  const slugById = new Map(people.map((p) => [p.id, p.slug]))

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Waypoints size={15} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Lazos débiles que podrían abrir una puerta</div>
        </div>
        <p className="text-[12px] text-muted-foreground mb-3">
          Los contactos lejanos, no los íntimos, son los que te conectan a otros círculos (Granovetter).
        </p>
        <div className="space-y-4">
          {byGoal.map((g) => (
            <div key={g.goalId}>
              <div className="text-sm font-medium text-foreground mb-1.5">{g.goalTitle}</div>
              <ul className="space-y-1.5">
                {g.ties.map((t) => {
                  const slug = slugById.get(t.personId)
                  return (
                    <li key={t.personId} className="text-sm">
                      {slug ? (
                        <Link href={`/relaciones/${slug}`} className="text-foreground hover:underline">{t.name}</Link>
                      ) : (
                        <span className="text-foreground">{t.name}</span>
                      )}
                      <span className="text-[11px] text-muted-foreground/70"> · {t.category === 'peripheral' ? 'periferia' : 'red'}</span>
                      <span className="block text-[12px] text-muted-foreground leading-snug">{t.reason}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
