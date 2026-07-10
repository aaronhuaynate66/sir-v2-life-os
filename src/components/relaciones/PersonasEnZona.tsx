'use client'

// SIR V2 — Cross-referencing por UBICACIÓN (Clay #8): "X vive en Barranco →
// estas otras personas también". Cruce HONESTO — sólo el hecho verificable
// (comparten zona) + una sugerencia condicional. No afirma cercanía con Aaron.
//
// Vive dentro de la card "Datos de la persona", debajo de la ubicación. Sólo
// asoma si hay al menos otra persona en la misma zona. Determinístico
// (zoneMatesOf), cero I/O.

import Link from 'next/link'
import { MapPin } from 'lucide-react'

import type { Person } from '@/types'
import { zoneMatesOf } from '@/lib/relaciones/proximity'

const MAX_SHOWN = 6

export function PersonasEnZona({ person, people }: { person: Person; people: Person[] }) {
  const result = zoneMatesOf(person, people)
  if (!result) return null

  const { zone, mates } = result
  const shown = mates.slice(0, MAX_SHOWN)
  const rest = mates.length - shown.length
  const firstName = person.name.split(' ')[0]

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <MapPin size={12} strokeWidth={1.75} aria-hidden="true" />
        En la misma zona ({zone.label})
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((m) => (
          <li key={m.id}>
            <Link
              href={m.slug ? `/relaciones/${m.slug}` : `/relaciones/${m.id}`}
              className="inline-flex items-center rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[12px] text-foreground/90 hover:bg-accent/10 transition-colors"
            >
              {m.name}
            </Link>
          </li>
        ))}
        {rest > 0 && (
          <li className="inline-flex items-center px-1 text-[12px] text-muted-foreground">
            +{rest} más
          </li>
        )}
      </ul>
      <p className="mt-2 text-[10.5px] text-muted-foreground/70">
        {firstName} comparte zona con {mates.length === 1 ? 'esta persona' : 'estas personas'}. Si
        caés por {zone.label}, podés verlas de una.
      </p>
    </div>
  )
}
