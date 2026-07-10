'use client'
// SIR V2 — Ventana de Contacto (Motor #6). ¿Buen momento para escribirle?
// Cruza señales que ya tiene la ficha (último contacto, fechas próximas,
// conflictos abiertos, fase del ciclo) → estado + por qué + tono. Consideración,
// no extracción.

import { MessageCircle } from 'lucide-react'
import { EmbeddableCard } from './EmbeddableCard'
import { SectionTitle } from '@/components/ui/section-title'
import type { Person } from '@/types'
import { type ContactWindowState } from '@/lib/relationships/contactWindow'
import { useContactWindow } from './useContactWindow'

const META: Record<ContactWindowState, { label: string; color: string }> = {
  buen_momento: { label: 'Buen momento', color: '#2dd4a7' },
  con_cuidado: { label: 'Con cuidado', color: '#e0a93b' },
  neutral: { label: 'Cuando quieras', color: '#8a8f98' },
}

export function ContactWindowBadge({
  person,
  lastTone = null,
  hideUnlessNeutral = false,
  embedded = false,
}: {
  person: Person
  lastTone?: number | null
  /** Dedup con el CareBanner del hero: si true, se muestra SOLO en estado
   *  neutral ("Cuando quieras"). Cuando hay señal (buen_momento/con_cuidado),
   *  el banner de arriba ya la muestra, así que acá nos ocultamos. */
  hideUnlessNeutral?: boolean
  /** Renderiza como sección dentro de la card "Estado del vínculo". */
  embedded?: boolean
}) {
  const win = useContactWindow(person, lastTone)
  if (hideUnlessNeutral && win.state !== 'neutral') return null
  const meta = META[win.state]

  return (
    <EmbeddableCard embedded={embedded}>
        <SectionTitle icon={MessageCircle} label="Ventana de contacto" />
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ backgroundColor: `${meta.color}22`, color: meta.color }}>
            {meta.label}
          </span>
          <span className="text-[13px] text-foreground/90">{win.reason}</span>
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">Cuándo escribirle: {win.tone}</p>
    </EmbeddableCard>
  )
}
