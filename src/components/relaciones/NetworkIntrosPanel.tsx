'use client'

// SIR V2 — 15·7: presentaciones de valor. Pares de personas tuyas que comparten
// organización pero NO están conectadas por una arista del grafo → una intro que
// podrías hacer vos. Invisible si no hay ninguna. Reusa el motor puro
// suggestIntroductions sobre people + person_links del store.
import { useMemo } from 'react'
import Link from 'next/link'
import { Handshake } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useRelationshipStore } from '@/stores'
import { suggestIntroductions, type NetEdge, type NetPerson } from '@/lib/relational/network'

export function NetworkIntrosPanel() {
  const people = useRelationshipStore((s) => s.people)
  const personLinks = useRelationshipStore((s) => s.personLinks)

  const intros = useMemo(() => {
    const edges: NetEdge[] = (personLinks ?? []).map((l) => ({ aId: l.personAId, bId: l.personBId }))
    const net: NetPerson[] = people.map((p) => ({
      id: p.id, name: p.name, importance: p.importanceScore, organization: p.organization ?? null,
    }))
    return suggestIntroductions(edges, net, { limit: 6 })
  }, [people, personLinks])

  const slugById = useMemo(() => new Map(people.map((p) => [p.id, p.slug])), [people])
  if (intros.length === 0) return null

  function nameLink(id: string, name: string) {
    const slug = slugById.get(id)
    return slug ? (
      <Link href={`/relaciones/${slug}`} className="text-foreground hover:underline">{name}</Link>
    ) : (
      <span className="text-foreground">{name}</span>
    )
  }

  return (
    <Card className="shadow-none mb-6">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <Handshake size={15} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Presentaciones que podrías hacer</div>
        </div>
        <ul className="space-y-2">
          {intros.map((i) => (
            <li key={`${i.aId}|${i.bId}`} className="text-sm">
              {nameLink(i.aId, i.aName)} <span className="text-muted-foreground">↔</span> {nameLink(i.bId, i.bName)}
              <span className="block text-[11px] text-muted-foreground/70">{i.reason}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
