'use client'
// SIR V2 — Bitácora (#17 del detail page V1): historial completo de
// interacciones, colapsable.
//
// Timeline unificado y cronológico de TODO lo registrado con la persona:
//   - person_logs (ánimo/energía/sueño/dolor/interacción) — Sesión 6.
//   - observations curadas (WhatsApp, Instagram, LinkedIn, notas, voz).
//
// Solo display sobre data ya fetched server-side (no backend, no LLM). Las
// memorias se omiten a propósito: derivan de las observations y ya tienen
// su propio panel (MemoriasAsociadasPanel) — incluirlas duplicaría.
//
// Colapsada por defecto (puede crecer mucho); el header muestra el total.

import { useState } from 'react'
import { ChevronDown, NotebookPen } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DiscardCaptureButton } from './DiscardCaptureButton'
import { cn } from '@/lib/utils'
import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'
import type { Observation, CaptureType } from '@/lib/capture/observations/types'

export interface BitacoraProps {
  personLogs: PersonLog[]
  observations: Observation[]
}

interface Entry {
  id: string
  /** ISO de cuándo ocurrió. */
  at: string
  source: 'log' | 'observation'
  label: string
  detail: string | null
  /** Para logs: "3/5". */
  value: string | null
  /** id crudo de la observation (solo source='observation') → permite descartar. */
  obsId?: string
}

const LOG_LABEL: Record<PersonLogKind, string> = {
  mood: 'Ánimo',
  energy: 'Energía',
  sleep: 'Sueño',
  pain: 'Dolor',
  interaction: 'Interacción',
}

const CAPTURE_LABEL: Record<CaptureType, string> = {
  whatsapp_chat: 'WhatsApp',
  whatsapp_web: 'WhatsApp Web',
  whatsapp_info: 'WhatsApp · info',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  scale: 'Báscula',
  manual_note: 'Nota',
  voice_note: 'Nota de voz',
  unknown: 'Captura',
}

const INITIAL_VISIBLE = 12

function observationDetail(obs: Observation): string | null {
  const d = obs.data ?? {}
  const summary = typeof d.summary === 'string' ? d.summary : null
  if (summary) return summary
  if (obs.captureType === 'instagram' && typeof d.handle === 'string') return `@${d.handle}`
  if (obs.captureType === 'linkedin' && typeof d.headline === 'string') return d.headline as string
  return null
}

function buildEntries(personLogs: PersonLog[], observations: Observation[]): Entry[] {
  const entries: Entry[] = []
  for (const log of personLogs) {
    entries.push({
      id: `log:${log.id}`,
      at: log.loggedAt,
      source: 'log',
      label: LOG_LABEL[log.kind] ?? log.kind,
      detail: log.note,
      value: `${log.value}/5`,
    })
  }
  for (const obs of observations) {
    entries.push({
      id: `obs:${obs.id}`,
      at: obs.observedAt,
      source: 'observation',
      label: CAPTURE_LABEL[obs.captureType] ?? obs.captureType,
      detail: observationDetail(obs),
      value: null,
      obsId: obs.id,
    })
  }
  entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return entries
}

const DAY_MS = 86_400_000
const ABS = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' })

function formatRelative(iso: string): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Date.now() - t
  if (diff < 0) return ABS.format(new Date(t))
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return mins < 1 ? 'recién' : `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(diff / DAY_MS)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days}d`
  if (days < 30) return `hace ${Math.floor(days / 7)}sem`
  return ABS.format(new Date(t))
}

export function Bitacora({ personLogs, observations }: BitacoraProps) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const entries = buildEntries(personLogs, observations)
  const visible = showAll ? entries : entries.slice(0, INITIAL_VISIBLE)

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 group"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2">
            <NotebookPen size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Bitácora</div>
            {entries.length > 0 && (
              <Badge variant="outline" className="text-[10px] font-mono">{entries.length}</Badge>
            )}
          </div>
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            className={cn('text-muted-foreground/60 transition-transform group-hover:text-foreground', open && 'rotate-180')}
            aria-hidden="true"
          />
        </button>

        {open && (
          <div className="mt-4">
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Sin interacciones registradas todavía. Los registros rápidos, las
                interacciones y las capturas aparecerán acá en orden cronológico.
              </p>
            ) : (
              <>
                <ol className="relative space-y-2.5 border-l border-border/50 pl-4">
                  {visible.map((e) => (
                    <li key={e.id} className="relative">
                      <span
                        className={cn(
                          'absolute -left-[1.30rem] top-1.5 w-1.5 h-1.5 rounded-full',
                          e.source === 'log' ? 'bg-brand/70' : 'bg-muted-foreground/50',
                        )}
                        aria-hidden="true"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider shrink-0">
                            {e.label}
                          </Badge>
                          {e.value && (
                            <span className="text-xs font-mono tabular-nums text-foreground shrink-0">{e.value}</span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                          {formatRelative(e.at)}
                        </span>
                      </div>
                      {e.detail && (
                        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{e.detail}</p>
                      )}
                      {e.obsId && (
                        <div className="mt-0.5">
                          <DiscardCaptureButton
                            observationId={e.obsId}
                            label="Descartar"
                            what={`Captura de ${e.label}`}
                            className="h-6 px-1.5 text-[10px]"
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ol>

                {entries.length > INITIAL_VISIBLE && (
                  <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)} className="mt-3 w-full">
                    <ChevronDown
                      size={13}
                      strokeWidth={1.75}
                      className={cn('mr-1.5 transition-transform', showAll && 'rotate-180')}
                    />
                    {showAll ? 'Ver menos' : `Ver todas (${entries.length})`}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
