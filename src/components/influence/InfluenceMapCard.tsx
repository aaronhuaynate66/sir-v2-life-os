'use client'

// SIR V2 — InfluenceMapCard (16·M2): quién más pesa alrededor de un objetivo.
// Corre el motor puro `engines/influence-map` sobre el grafo del store (personas
// + person_links) para la persona objetivo. Client-side, cero LLM. Le da a la
// Sala de ensayo "el camino real": el círculo de la decisión, quién está
// conectado con el objetivo, y los líderes informales por conectividad.

import { useMemo } from 'react'
import { Network, Users2, GitFork, Waypoints } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useRelationshipStore } from '@/stores'
import { buildInfluenceMap, type InfluenceNode } from '@/engines/influence-map'

export function InfluenceMapCard({ targetId }: { targetId: string }) {
  const people = useRelationshipStore((s) => s.people)
  const personLinks = useRelationshipStore((s) => s.personLinks)

  const map = useMemo(() => {
    return buildInfluenceMap({
      people: people.map((p) => ({ id: p.id, name: p.name, importanceScore: p.importanceScore, orgGroup: p.orgGroup, organization: p.organization, title: p.title })),
      links: personLinks.map((l) => ({ aId: l.personAId, bId: l.personBId })),
      targetId,
    })
  }, [people, personLinks, targetId])

  const nothing = map.cohort.length === 0 && map.connectors.length === 0 && map.hubs.length === 0
  const name = map.targetName ?? 'esta persona'

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <Network size={15} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Quién más pesa acá</h2>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
          El organigrama miente — la influencia real pasa por otros. Esto es el mapa alrededor de {name}.
        </p>

        {nothing ? (
          <p className="text-[12px] text-muted-foreground leading-relaxed">{map.note}</p>
        ) : (
          <div className="space-y-3">
            {map.connectors.length > 0 && (
              <Group icon={Waypoints} title={`Conectados con ${name}`} nodes={map.connectors} />
            )}
            {map.cohort.length > 0 && (
              <Group icon={Users2} title="El círculo de la decisión" nodes={map.cohort} />
            )}
            {map.hubs.length > 0 && (
              <Group icon={GitFork} title="Líderes informales (por conectividad)" nodes={map.hubs} />
            )}
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed pt-1 border-t border-border/50">{map.note}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Group({ icon: Icon, title, nodes }: { icon: typeof Users2; title: string; nodes: InfluenceNode[] }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={12} strokeWidth={1.75} className="text-muted-foreground/60" aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary">{title}</span>
      </div>
      <ul className="space-y-1">
        {nodes.map((n) => (
          <li key={n.id} className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="text-foreground">{n.name}</span>
            <span className="text-[11px] text-muted-foreground/80 truncate">{n.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
