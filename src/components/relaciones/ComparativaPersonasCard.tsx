'use client'
// SIR V2 — ComparativaPersonasCard: ranking de vínculos por salud.
//
// Muestra top N personas ordenadas de mejor a peor según score compuesto
// (tono + urgencias + freshness). Toggle "Ver peores" invierte el orden.
// Se monta en /relaciones arriba de la lista principal.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, TrendingDown, ChevronRight, Loader2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Persona {
  personId: string
  personName: string
  personSlug: string | null
  toneAvg: number | null
  toneSamples: number
  openMoments: number
  overdueMoments: number
  daysSinceLast: number | null
  score: number
}

function scoreColor(score: number): string {
  if (score >= 110) return 'text-ok'
  if (score >= 90) return 'text-muted-foreground'
  if (score >= 70) return 'text-warn'
  return 'text-bad'
}

function daysLabel(n: number | null): string {
  if (n == null) return 'nunca'
  if (n === 0) return 'hoy'
  if (n === 1) return 'ayer'
  if (n < 7) return `${n}d`
  if (n < 30) return `${Math.floor(n / 7)}sem`
  return `${Math.floor(n / 30)}m`
}

export function ComparativaPersonasCard() {
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [orderPeores, setOrderPeores] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/personas/comparativa?limit=30', { cache: 'no-store' })
      if (!r.ok) { setPersonas([]); return }
      const j = (await r.json()) as { personas?: Persona[] }
      setPersonas(j.personas ?? [])
    } catch { setPersonas([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const sorted = useMemo(() => {
    if (!personas) return []
    return orderPeores ? [...personas].reverse() : personas
  }, [personas, orderPeores])
  const top = sorted.slice(0, 10)

  if (loading && personas == null) {
    return (
      <Card className="shadow-none mb-6">
        <CardContent className="p-4 sm:p-5 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" /> Calculando ranking…
        </CardContent>
      </Card>
    )
  }
  if (!personas || personas.length === 0) return null

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-6">
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <BarChart3 size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">
              {orderPeores ? 'Vínculos que atender' : 'Vínculos donde estás mejor'}
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">{top.length}</Badge>
            <button
              type="button"
              onClick={() => setOrderPeores((v) => !v)}
              className="ml-auto text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              {orderPeores ? '↑ Ver mejores' : '↓ Ver peores'}
            </button>
          </div>

          <ul className="space-y-1">
            {top.map((p, i) => (
              <li key={p.personId}>
                <Link
                  href={p.personSlug ? `/relaciones/${p.personSlug}` : '/relaciones'}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors"
                >
                  <span className="text-[10px] font-mono text-muted-foreground/60 w-4 text-right shrink-0">{i + 1}</span>
                  <span className="text-sm text-foreground font-medium min-w-0 flex-1 truncate">{p.personName}</span>
                  <span className={cn('text-[10px] font-mono tabular-nums', scoreColor(p.score))}>
                    {p.score >= 100 ? <TrendingUp size={9} className="inline mb-0.5" /> : <TrendingDown size={9} className="inline mb-0.5" />}
                    {' '}{p.score}
                  </span>
                  <div className="hidden sm:flex items-center gap-2 text-[10px] text-muted-foreground/70 font-mono tabular-nums shrink-0 min-w-[110px] justify-end">
                    {p.toneAvg != null && <span>{p.toneAvg}/5</span>}
                    {p.overdueMoments > 0 && <span className="text-bad">·{p.overdueMoments}⌛</span>}
                    <span>·{daysLabel(p.daysSinceLast)}</span>
                  </div>
                  <ChevronRight size={12} className="text-muted-foreground/50 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>

          <p className="text-[10px] text-muted-foreground/60 leading-relaxed pt-1 border-t border-border/40">
            Score compuesto: tono ({sortNegative(30)}), moments abiertos ({sortNegative(-10)}), overdue ({sortNegative(-20)}), y freshness. Solo personas con importance ≥ 3.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function sortNegative(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}
