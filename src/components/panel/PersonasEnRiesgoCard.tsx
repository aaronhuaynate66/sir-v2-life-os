'use client'
// SIR V2 — PersonasEnRiesgoCard: TOP personas que necesitan atención (Mission Control).
//
// Aparece en /panel cuando hay al menos una persona con overdue o tono bajo.
// Se oculta silenciosamente si todo está tranquilo. Fetch inicial + auto-refresh
// cuando el usuario vuelve a la pestaña.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { AlertCircle, Users, ChevronRight, Loader2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { parseErrorResponse, toApiError, type ApiError } from '@/lib/api/errors'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Persona {
  personId: string
  personName: string
  personSlug: string | null
  reason: 'overdue' | 'due_soon' | 'low_tone' | 'multiple'
  overdueCount: number
  dueSoonCount: number
  toneAvg: number | null
  toneSamples: number
  mostUrgentTitle: string | null
  mostUrgentDaysDelta: number | null
}

const REASON_META: Record<Persona['reason'], { label: string; class: string }> = {
  overdue: { label: 'Pendiente vencido', class: 'text-bad border-bad/40 bg-bad-soft' },
  multiple: { label: 'Pendiente + tono bajo', class: 'text-bad border-bad/40 bg-bad-soft' },
  due_soon: { label: 'Vence pronto', class: 'text-warn border-warn/40 bg-warn-soft' },
  low_tone: { label: 'Tono bajo', class: 'text-warn border-warn/40 bg-warn-soft' },
}

function urgentText(p: Persona): string | null {
  if (!p.mostUrgentTitle || p.mostUrgentDaysDelta == null) return null
  const d = p.mostUrgentDaysDelta
  if (d < 0) return `${p.mostUrgentTitle} — vencido hace ${Math.abs(d)}d`
  if (d === 0) return `${p.mostUrgentTitle} — hoy`
  if (d === 1) return `${p.mostUrgentTitle} — mañana`
  return `${p.mostUrgentTitle} — en ${d}d`
}

export function PersonasEnRiesgoCard() {
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/panel/personas-en-riesgo', { cache: 'no-store' })
      if (!res.ok) { setError(await parseErrorResponse(res)); setPersonas([]); return }
      const j = (await res.json()) as { personas?: Persona[] }
      setPersonas(j.personas ?? [])
    } catch (e) {
      setError(toApiError(e)); setPersonas([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    function onVisibility() { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [load])

  if (loading && personas == null) {
    return (
      <Card className="shadow-none mb-4">
        <CardContent className="p-4 sm:p-5 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" /> Chequeando vínculos con atención pendiente…
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <div className="mb-4">
        <ApiErrorNotice error={error} className="p-3">
          <button onClick={() => void load()} className="mt-1 text-xs underline underline-offset-2 hover:text-foreground">Reintentar</button>
        </ApiErrorNotice>
      </div>
    )
  }
  if (!personas || personas.length === 0) return null

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-4">
      <Card className="shadow-none border-warn/30">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Users size={14} strokeWidth={1.75} className="text-warn" aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">
              Empieza por acá
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">{personas.length}</Badge>
            <span className="text-[10px] text-muted-foreground ml-auto">Personas con algo abierto o tono bajo</span>
          </div>

          <ul className="space-y-2">
            {personas.map((p) => (
              <li key={p.personId}>
                <Link
                  href={p.personSlug ? `/relaciones/${p.personSlug}` : `/relaciones/${p.personId}`}
                  className={cn(
                    'flex items-start gap-2 rounded-md border p-3 hover:opacity-90 transition-opacity',
                    REASON_META[p.reason].class,
                  )}
                >
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0 opacity-70" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">{p.personName}</span>
                      <Badge variant="outline" className={cn('text-[9px] font-medium border-current bg-transparent', REASON_META[p.reason].class)}>
                        {REASON_META[p.reason].label}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {urgentText(p) && <span>{urgentText(p)}</span>}
                      {p.toneAvg != null && (
                        <span>{urgentText(p) ? ' · ' : ''}tono {p.toneAvg}/5 ({p.toneSamples} interacciones)</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={13} className="text-muted-foreground shrink-0 mt-1" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  )
}
