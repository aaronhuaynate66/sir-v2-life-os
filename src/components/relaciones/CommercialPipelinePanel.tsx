'use client'
// SIR V2 — "Oportunidades comerciales": leads sacados de tus vínculos
// (tags comercial/marlab/cliente/prospecto), ordenados por enfriamiento para
// que no se te mueran por no responder. Determinístico.

import Link from 'next/link'
import { Briefcase, Flame } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { buildCommercialPipeline } from '@/lib/relaciones/commercialPipeline'
import type { Person } from '@/types'

export function CommercialPipelinePanel({ people }: { people: Person[] }) {
  const leads = buildCommercialPipeline(people)
  if (leads.length === 0) return null

  return (
    <Card className="mb-4 border-[#14b8a6]/30">
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={Briefcase} label="Oportunidades comerciales" count={leads.length} />
        <p className="mt-1 text-[12px] text-muted-foreground">Leads de tus vínculos, del más frío al más reciente. No los dejes enfriar.</p>
        <ul className="mt-3 space-y-1.5">
          {leads.map((l) => (
            <li key={l.id}>
              <Link
                href={l.slug ? `/relaciones/${l.slug}` : '/relaciones'}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 hover:border-[#14b8a6]/50"
              >
                <span className="min-w-0">
                  <span className="text-[14px] text-foreground">{l.name}</span>
                  {l.lastNote && <span className="block truncate text-[12px] text-muted-foreground">{l.lastNote}</span>}
                </span>
                <span className={'shrink-0 inline-flex items-center gap-1 text-[12px] ' + (l.cooling ? 'text-amber-400' : 'text-muted-foreground')}>
                  {l.cooling && <Flame size={12} />}
                  {l.daysSinceContact === null ? 'sin contacto' : `hace ${l.daysSinceContact}d`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
