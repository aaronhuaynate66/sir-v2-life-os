'use client'
// SIR V2 — Espejo POSITIVO (#92 inverso): si esta persona es stakeholder interno
// de un deal abierto, avanzarlo SUMA a tu vínculo con ella y a tu standing.
// Caso Aaron: la licitación de Sienna no le paga bono, pero acercarla mejora su
// relación con Francisco y con Alex (GG de K2).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
import type { Deal, Person } from '@/types'
import { dealsForStakeholder } from '@/lib/deals/stakeholderImpact'

export function StakeholderDealImpact({ person }: { person: Person }) {
  const [deals, setDeals] = useState<Deal[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/deals')
        if (!res.ok) return
        const data = (await res.json()) as { deals?: Deal[] }
        if (!cancelled && Array.isArray(data.deals)) setDeals(data.deals)
      } catch {
        /* best-effort */
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (!deals) return null
  const impacts = dealsForStakeholder(deals, person.id)
  if (impacts.length === 0) return null

  const first = (person.name || '').trim().split(/\s+/)[0] || person.name
  return (
    <div className="rounded-lg border border-ok/30 bg-ok-soft/30 p-3 text-xs space-y-1.5">
      <div className="flex items-center gap-1.5 text-ok">
        <TrendingUp size={13} strokeWidth={2} aria-hidden="true" />
        <span className="font-medium">Suma a tu vínculo con {first}</span>
      </div>
      {impacts.map((im) => (
        <Link key={im.dealId} href="/oportunidades" className="block text-foreground/90 hover:underline">
          Avanzar <span className="font-medium">{im.title}</span> (etapa {im.stageLabel}) refuerza tu trabajo con {first} y tu standing.
          {im.recentlyActive ? ' Hay movimiento reciente — buen momento para apoyarte en ese vínculo.' : ''}
        </Link>
      ))}
    </div>
  )
}
