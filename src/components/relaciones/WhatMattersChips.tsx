'use client'

// SIR V2 — WhatMattersChips (15·8): "qué le importa a esta persona".
// Corre el motor puro `extractWhatMatters` sobre las memorias VISIBLES de la
// persona y muestra los temas recurrentes + sus tags. Client-side, cero LLM —
// una pista barata y siempre a la vista para que el contacto sea real, no
// genérico. Se oculta si no hay nada.

import { useMemo } from 'react'
import { Heart } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { extractWhatMatters } from '@/lib/people/whatMatters'
import { useSelfStore } from '@/stores'
import type { Memory } from '@/types'

export function WhatMattersChips({ memories, tags, name }: { memories: Memory[]; tags: string[]; name: string }) {
  // El nombre del propio usuario se excluye de los temas (en un chat de pareja
  // domina como autorreferencia — "aaron ×10" — y no es un tema de la persona).
  const selfName = useSelfStore((s) => s.identityProfile?.fullName ?? '')
  const { themes, tags: curated } = useMemo(
    () => extractWhatMatters(memories.map((m) => m.content ?? ''), { tags, excludeName: name, selfName }),
    [memories, tags, name, selfName],
  )

  if (themes.length === 0 && curated.length === 0) return null

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Heart size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Qué le importa</h2>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
          Temas recurrentes de lo que registraste — para que el contacto le hable a lo suyo, no genérico.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {curated.map((t) => (
            <Badge key={`tag-${t}`} variant="brand" className="text-[11px] font-normal">{t}</Badge>
          ))}
          {themes.map((t) => (
            <Badge key={`th-${t.term}`} variant="outline" className="text-[11px] font-normal">
              {t.term}{t.count > 2 && <span className="ml-1 text-muted-foreground/60 tabular-nums">×{t.count}</span>}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
