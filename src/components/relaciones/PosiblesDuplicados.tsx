'use client'
// SIR V2 — PosiblesDuplicados: señala personas que probablemente sean la misma
// (mismo nombre/alias normalizado) para que el usuario las revise y unifique a
// mano. READ-ONLY: no fusiona ni borra. Se oculta si no hay nada que mostrar
// (cero ruido cuando el grafo está limpio). Pasa el filtro paz/objetivos: da
// claridad, no recarga.

import Link from 'next/link'
import { AlertCircle, ArrowRight } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useRelationshipStore } from '@/stores'
import { findDuplicatePeople, type DupPerson } from '@/lib/people/duplicates'

export function PosiblesDuplicados() {
  const people = useRelationshipStore((s) => s.people)

  const input: DupPerson[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    alias: p.alias,
  }))
  const groups = findDuplicatePeople(input)

  if (groups.length === 0) return null

  return (
    <Card className="mb-6 shadow-none border-warn/30">
      <CardContent className="p-4 sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <AlertCircle size={16} strokeWidth={1.75} className="text-warn-foreground/80" aria-hidden="true" />
          <h2 className="text-sm font-semibold tracking-tight">Posibles duplicados</h2>
          <Badge variant="secondary" className="text-[10px] font-mono">{groups.length}</Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
          Estas personas parecen repetidas (mismo nombre o alias). Revisalas: abrí la que querés
          conservar, pasá lo que falte y borrá la sobrante desde su ficha. SIR no las une solo para
          no mezclar a quien no debe.
        </p>
        <div className="space-y-2">
          {groups.map((g, i) => (
            <div key={i} className="rounded-md border border-border bg-muted/20 p-3">
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1.5">
                {g[0].name} · {g.length}
              </div>
              <ul className="space-y-1">
                {g.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={p.slug ? `/relaciones/${p.slug}` : '#'}
                      className="text-xs flex items-center justify-between gap-3 rounded px-2 py-1.5 hover:bg-accent/10"
                    >
                      <span className="text-foreground">
                        {p.name}
                        {p.alias && <span className="text-muted-foreground"> · {p.alias}</span>}
                      </span>
                      <ArrowRight size={13} className="text-muted-foreground shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
