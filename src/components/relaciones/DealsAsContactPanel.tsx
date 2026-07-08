'use client'

// SIR V2 — Deals donde esta persona es el CONTACTO/decisor (rescate de dato).
//
// Los deals con contact_person_id = esta persona no aparecían en su ficha (solo
// en el overview /relaciones). Para un lead/colega comercial, SU pipeline es lo
// más importante de su ficha. Se gatea por fichaProfile.showCommercial (colega +
// lead); para pareja/familia/amigo ni se monta. Fetch best-effort a /api/deals.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Briefcase } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SectionTitle } from '@/components/ui/section-title'
import { STAGE_LABEL, STAGE_ORDER, isOpenDeal } from '@/lib/deals/pipeline'
import type { Deal } from '@/types'

function fmtAmount(amount?: number, currency?: string): string | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null
  const cur = currency || 'USD'
  return `${cur} ${amount.toLocaleString('es-PE')}`
}

export function DealsAsContactPanel({ person }: { person: { id: string; name: string } }) {
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
  const mine = deals
    .filter((d) => d.contactPersonId === person.id)
    .sort((a, b) => {
      // Abiertos primero; dentro, por orden de etapa.
      const oa = isOpenDeal(a) ? 0 : 1
      const ob = isOpenDeal(b) ? 0 : 1
      if (oa !== ob) return oa - ob
      return STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)
    })
  if (mine.length === 0) return null

  const first = (person.name || '').trim().split(/\s+/)[0] || person.name

  return (
    <Card className="mb-4 border-[#14b8a6]/30">
      <CardContent className="p-4 sm:p-5">
        <SectionTitle icon={Briefcase} label={`Pipeline con ${first}`} count={mine.length} />
        <p className="mt-1 text-[12px] text-muted-foreground">Deals donde {first} es el contacto/decisor. Sus próximos pasos comerciales.</p>
        <ul className="mt-3 space-y-2">
          {mine.map((d) => {
            const open = isOpenDeal(d)
            const amount = fmtAmount(d.amount, d.currency)
            return (
              <li key={d.id}>
                <Link
                  href={`/oportunidades?deal=${encodeURIComponent(d.id)}`}
                  className="block rounded-lg border border-border bg-card px-3 py-2 hover:border-[#14b8a6]/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[14px] text-foreground">{d.title}</span>
                    <Badge variant={open ? 'outline' : 'secondary'} className="shrink-0 text-[10px] font-mono">
                      {STAGE_LABEL[d.stage]}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                    {d.clientOrg && <span>{d.clientOrg}</span>}
                    {amount && <span className="font-mono tabular-nums">{amount}</span>}
                    {d.closeWindow && <span>cierre {d.closeWindow}</span>}
                  </div>
                  {d.nextAction && (
                    <div className="mt-1 text-[12px] text-foreground/80">
                      Próximo: {d.nextAction}
                      {d.nextActionDate && <span className="text-muted-foreground"> · {d.nextActionDate}</span>}
                    </div>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
