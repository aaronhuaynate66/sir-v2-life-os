'use client'
// SIR V2 — "Se viene": anticipación proactiva de cuidado en Mission Control.
//
// Los próximos planes con tu pareja, cada uno con EN QUÉ FASE/ÁNIMO va a llegar +
// la sugerencia principal. Para llegar preparado sin entrar a la ficha. Se auto-
// oculta si no hay planes próximos. LÍNEA ÉTICA (doc 17): cuidado, no gestión.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { HeartHandshake, ChevronRight } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

interface CareItem {
  eventLabel: string
  eventDateIso: string
  daysUntilEvent: number
  personName: string
  personSlug: string | null
  phaseLabel: string
  isPms: boolean
  headline: string
  topSuggestion: string
  confidence: 'alta' | 'media' | 'baja'
}

function fmt(iso: string): string {
  try { return new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) } catch { return iso }
}
function countdown(d: number): string {
  if (d <= 0) return 'hoy'
  if (d === 1) return 'mañana'
  return `en ${d}d`
}

export function UpcomingCarePanel() {
  const [items, setItems] = useState<CareItem[]>([])

  useEffect(() => {
    let alive = true
    fetch('/api/care/upcoming', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && Array.isArray(d.items)) setItems(d.items as CareItem[]) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  if (items.length === 0) return null

  return (
    <Card className="shadow-none border-brand/30">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <HeartHandshake size={14} strokeWidth={1.75} className="text-brand-soft-foreground" aria-hidden="true" />
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-soft-foreground">Se viene · cuidá a tu gente</span>
        </div>
        <ul className="space-y-3">
          {items.slice(0, 4).map((it) => {
            const inner = (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-foreground truncate">♥ {it.eventLabel}</span>
                  <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">{fmt(it.eventDateIso)} · {countdown(it.daysUntilEvent)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {it.personName.split(' ')[0]} llega en <span className={it.isPms ? 'text-warn' : 'text-foreground/80'}>{it.phaseLabel}{it.isPms ? ' · SPM' : ''}</span>
                </div>
                <div className="text-[12px] text-foreground/85 leading-snug mt-1">→ {it.topSuggestion}</div>
              </>
            )
            return (
              <li key={it.eventLabel + it.eventDateIso} className="rounded-md border border-border/50 px-3 py-2">
                {it.personSlug ? (
                  <Link href={`/relaciones/${it.personSlug}`} className="block group">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">{inner}</div>
                      <ChevronRight size={14} className="text-muted-foreground/50 group-hover:text-foreground shrink-0 ml-2" aria-hidden="true" />
                    </div>
                  </Link>
                ) : inner}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
