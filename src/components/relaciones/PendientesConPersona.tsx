'use client'
// SIR V2 — PendientesConPersona: qué quedó ABIERTO con esta persona.
//
// Los `relationship_moments` con status='abierto' viven mezclados en la
// Bitácora con TODO lo demás (interacciones, memorias, notas). Aaron
// necesitaba un lugar EN LA CIMA de la ficha que le grite qué está pendiente:
// pelea sin resolver, follow-up de un análisis médico, un mensaje que
// prometió mandar, etc.
//
// Prioridad de urgencia:
//   - overdue: follow-up ya pasó → bad (rojo)
//   - dueSoon: follow-up dentro de 3 días → warn (ámbar)
//   - later: follow-up más lejos → neutral
//   - sinFecha: sin follow-up → neutral (el moment sigue ahí, sin plazo)
//
// CTA: "Resolver" → PATCH /api/moments {id, status:'resuelto', resolution}.
// El diálogo pide una resolución en 1-2 líneas. Se oculta si no hay abiertos.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, Circle, Check, X, ChevronDown } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { RelationshipMoment } from '@/lib/moments/types'
import { urgencyOf, labelDelta, ymdLocal, URGENCY_RANK, type Urgency } from '@/lib/moments/urgency'

interface Props {
  personId: string
  moments: RelationshipMoment[]
  onChange?: () => void
}

interface Row {
  moment: RelationshipMoment
  urgency: Urgency
  /** Días hasta follow-up (negativo si ya pasó). */
  deltaDays: number | null
}

function urgencyClass(u: Urgency): string {
  switch (u) {
    case 'overdue': return 'border-bad/40 bg-bad-soft'
    case 'dueSoon': return 'border-warn/40 bg-warn-soft'
    default: return 'border-border bg-muted/20'
  }
}
function urgencyPill(u: Urgency): string {
  switch (u) {
    case 'overdue': return 'text-bad border-bad/40'
    case 'dueSoon': return 'text-warn border-warn/40'
    default: return 'text-muted-foreground border-border'
  }
}

export function PendientesConPersona({ personId, moments, onChange }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [resolution, setResolution] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const rows = useMemo<Row[]>(() => {
    const todayYmd = ymdLocal(new Date())
    // Aceptar episodios compartidos: la persona puede ser primaria O participante.
    const open = moments.filter(
      (m) => m.status === 'abierto' && (m.personId === personId || (m.participantIds ?? []).includes(personId)),
    )
    const built = open.map((m) => {
      const { urgency, deltaDays } = urgencyOf(m.followUpOn, todayYmd)
      return { moment: m, urgency, deltaDays }
    })
    built.sort((a, b) => {
      const ra = URGENCY_RANK[a.urgency], rb = URGENCY_RANK[b.urgency]
      if (ra !== rb) return ra - rb
      // Dentro del mismo grupo, más viejo primero (fecha de ocurrencia asc).
      return a.moment.occurredOn.localeCompare(b.moment.occurredOn)
    })
    return built
  }, [personId, moments])

  if (rows.length === 0) return null

  const overdue = rows.filter((r) => r.urgency === 'overdue').length
  const dueSoon = rows.filter((r) => r.urgency === 'dueSoon').length
  const visibleRows = showAll ? rows : rows.slice(0, 3)

  async function resolveMoment(id: string) {
    const text = resolution.trim()
    if (!text) return
    setBusy(id)
    try {
      const res = await fetch('/api/moments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'resuelto', resolution: text }),
      })
      if (res.ok) {
        setExpandedId(null); setResolution('')
        onChange?.()
      }
    } catch { /* silent */ } finally {
      setBusy(null)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-4">
      <Card className="shadow-none border-border/70">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <AlertCircle size={14} strokeWidth={1.75} className={cn(
              overdue > 0 ? 'text-bad' : dueSoon > 0 ? 'text-warn' : 'text-muted-foreground/70',
            )} aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">
              Pendientes con esta persona
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">{rows.length}</Badge>
            {overdue > 0 && (
              <Badge variant="outline" className={cn('text-[10px] font-mono', urgencyPill('overdue'))}>
                {overdue} atrasado{overdue === 1 ? '' : 's'}
              </Badge>
            )}
            {dueSoon > 0 && (
              <Badge variant="outline" className={cn('text-[10px] font-mono', urgencyPill('dueSoon'))}>
                {dueSoon} esta semana
              </Badge>
            )}
          </div>

          <ul className="space-y-2">
            {visibleRows.map(({ moment, urgency, deltaDays }) => (
              <li key={moment.id} className={cn('rounded-md border px-3 py-2', urgencyClass(urgency))}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Circle size={8} strokeWidth={2} className="text-muted-foreground/70 flex-shrink-0" fill="currentColor" aria-hidden="true" />
                      <span className="text-sm text-foreground font-medium truncate">{moment.title}</span>
                    </div>
                    {moment.detail && (
                      <p className="text-xs text-muted-foreground leading-relaxed mt-1 ml-3.5 line-clamp-2">{moment.detail}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className={cn('text-[10px] font-mono tabular-nums', urgencyPill(urgency))}>
                      {labelDelta(urgency, deltaDays)}
                    </Badge>
                    {expandedId === moment.id ? (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => { setExpandedId(null); setResolution('') }}>
                        <X size={12} strokeWidth={2} className="mr-1" /> Cancelar
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => { setExpandedId(moment.id); setResolution('') }}>
                        <Check size={12} strokeWidth={2} className="mr-1" /> Resolver
                      </Button>
                    )}
                  </div>
                </div>
                {expandedId === moment.id && (
                  <div className="mt-2 ml-3.5 space-y-2">
                    <textarea
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      placeholder="¿Cómo se resolvió? Ej. hablamos y quedó claro, o mensaje enviado el X…"
                      rows={2}
                      className="w-full rounded-md border border-border bg-background p-2 text-xs leading-relaxed outline-none focus:border-foreground/40"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => void resolveMoment(moment.id)}
                        disabled={!resolution.trim() || busy === moment.id}
                      >
                        {busy === moment.id ? 'Guardando…' : 'Marcar resuelto'}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {rows.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 w-full inline-flex items-center justify-center gap-1 py-1.5 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors font-sans"
            >
              <ChevronDown size={12} strokeWidth={2} className={cn('transition-transform', showAll && 'rotate-180')} />
              {showAll ? 'Ver menos' : `Ver todos (${rows.length})`}
            </button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
