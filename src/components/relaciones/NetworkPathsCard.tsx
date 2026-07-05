'use client'

// SIR V2 — 15·7: cómo LLEGAR a esta persona. Sobre el grafo person↔person
// (person_links, incl. aristas profesionales del capturador 0128), muestra los
// mutuos que la conocen, rankeados por qué tan buen puente son. Invisible si nadie
// de tu red la conecta (honesto: sin grafo, sin caminos).
import { useMemo } from 'react'
import Link from 'next/link'
import { Route, ArrowRight } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useRelationshipStore } from '@/stores'
import { SELF_ID } from '@/lib/relationships/family'
import { findBridges, type NetEdge, type NetPerson } from '@/lib/relational/network'
import type { Person } from '@/types'

export function NetworkPathsCard({ person }: { person: Person }) {
  const people = useRelationshipStore((s) => s.people)
  const personLinks = useRelationshipStore((s) => s.personLinks)

  const bridges = useMemo(() => {
    const edges: NetEdge[] = (personLinks ?? [])
      .filter((l) => l.personAId !== SELF_ID && l.personBId !== SELF_ID)
      .map((l) => ({ aId: l.personAId, bId: l.personBId, weight: l.weight ?? null }))
    const byId = new Map<string, NetPerson>(
      people.map((p) => [p.id, { id: p.id, name: p.name, importance: p.importanceScore, organization: p.organization ?? null }]),
    )
    return findBridges(edges, byId, person.id, { selfId: SELF_ID })
  }, [people, personLinks, person.id])

  if (bridges.length === 0) return null

  const first = person.name.trim().split(/\s+/)[0]
  const slugById = new Map(people.map((p) => [p.id, p.slug]))

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <Route size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Cómo llegar a {first}</div>
        </div>
        <p className="text-[12px] text-muted-foreground mb-2">Mutuos de tu red que la/lo conocen — un puente para una presentación tibia.</p>
        <ul className="space-y-1.5">
          {bridges.map((b) => {
            const slug = slugById.get(b.viaId)
            return (
              <li key={b.viaId} className="flex items-center gap-2 text-sm">
                <ArrowRight size={13} strokeWidth={1.75} className="text-muted-foreground/50 shrink-0" aria-hidden="true" />
                <span className="text-muted-foreground">vía</span>
                {slug ? (
                  <Link href={`/relaciones/${slug}`} className="text-foreground hover:underline">{b.viaName}</Link>
                ) : (
                  <span className="text-foreground">{b.viaName}</span>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
