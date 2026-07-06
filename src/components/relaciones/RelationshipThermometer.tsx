'use client'

// SIR V2 — "Termómetro de relaciones" (Capa 0: analítica temporal agregada).
//
// Corre la analítica de conversación sobre TODAS las personas y muestra, de un
// vistazo, quiénes se están enfriando ↓ (quizás vale un mensaje) y quiénes calientan
// ↑. Cero LLM. Best-effort: si no hay señal, no aparece.

import { useEffect, useState } from 'react'
import { TrendingDown, TrendingUp, Thermometer } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

interface Row { personId: string; name: string; slopePerWeek: number; lastContactDaysAgo: number | null; total: number }

function ago(n: number | null): string {
  if (n == null) return ''
  if (n < 1) return 'hoy'
  if (n < 2) return 'ayer'
  return `hace ${Math.round(n)} d`
}

export function RelationshipThermometer() {
  const [data, setData] = useState<{ cooling: Row[]; heating: Row[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/conversation-analytics/overview')
        if (!res.ok) return
        const j = (await res.json()) as { cooling?: Row[]; heating?: Row[] }
        if (!cancelled) setData({ cooling: j.cooling ?? [], heating: j.heating ?? [] })
      } catch { /* opcional */ }
    })()
    return () => { cancelled = true }
  }, [])

  if (!data || (data.cooling.length === 0 && data.heating.length === 0)) return null

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Thermometer size={13} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Termómetro de relaciones</div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {data.cooling.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[13px] mb-1.5" style={{ color: 'hsl(var(--destructive))' }}>
                <TrendingDown size={14} strokeWidth={1.75} aria-hidden="true" /> Se están enfriando
              </div>
              <ul className="space-y-1">
                {data.cooling.map((r) => (
                  <li key={r.personId} className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="text-foreground/90 truncate">{r.name}</span>
                    <span className="font-mono tabular-nums text-muted-foreground text-[11px] shrink-0">{ago(r.lastContactDaysAgo)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.heating.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[13px] mb-1.5" style={{ color: 'hsl(var(--success))' }}>
                <TrendingUp size={14} strokeWidth={1.75} aria-hidden="true" /> Vienen calentando
              </div>
              <ul className="space-y-1">
                {data.heating.map((r) => (
                  <li key={r.personId} className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="text-foreground/90 truncate">{r.name}</span>
                    <span className="font-mono tabular-nums text-muted-foreground text-[11px] shrink-0">+{r.slopePerWeek}/sem</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
