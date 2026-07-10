'use client'
// SIR V2 — Bitácora (#17 del detail page V1): historial completo de
// interacciones, colapsable. El HILO CRONOLÓGICO ÚNICO de la persona: el
// corazón navegable de la ficha.
//
// Timeline unificado y cronológico de TODO lo registrado con la persona:
//   - person_logs (ánimo/energía/sueño/dolor/interacción) — Sesión 6.
//   - observations curadas (WhatsApp, Instagram, LinkedIn, notas, voz).
//   - notes_history (snapshots del campo `notes` al sobreescribirse).
//   - moments (decisiones/episodios relacionales).
//   - money (person_money: préstamos/transferencias con fecha) — antes solo
//     vivía en su panel de la tab Registro; ahora también en el hilo.
//
// Filtro por fuente (chips) cuando hay ≥2 fuentes presentes → hace el hilo
// navegable sin sacar nada de su lugar.
//
// Solo display sobre data ya fetched server-side (no backend, no LLM). Las
// memorias se omiten a propósito: derivan de las observations y ya tienen
// su propio panel (MemoriasAsociadasPanel) — incluirlas duplicaría el hilo.
//
// Abierta por defecto cuando hay contenido; el header muestra el total.

import { useMemo, useState } from 'react'
import { ChevronDown, NotebookPen } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DiscardCaptureButton } from './DiscardCaptureButton'
import { RebuildSummaryButton } from './RebuildSummaryButton'
import { cn } from '@/lib/utils'
import type { PersonLog } from '@/lib/person-logs/types'
import type { Observation } from '@/lib/capture/observations/types'
import type { PersonNoteHistoryEntry } from '@/lib/person-notes-history/fetch'
import type { RelationshipMoment } from '@/lib/moments/types'
import type { MoneyEntry } from '@/lib/money/types'
import { buildEntries, SOURCE_LABEL, SOURCE_ORDER, type EntrySource } from '@/lib/relaciones/bitacoraEntries'

export interface BitacoraProps {
  personLogs: PersonLog[]
  observations: Observation[]
  /** Snapshots del campo `notes` cuando se sobreescribió (mig 0108). Opcional:
   *  si no llega, la Bitácora sigue funcionando como antes. Los renderiza como
   *  entries "Nota editada · <snippet>". */
  notesHistory?: PersonNoteHistoryEntry[]
  /** Momentos / decisiones relacionales de la persona (relationship_moments).
   *  Opcional: si no llega, no aparecen. */
  moments?: RelationshipMoment[]
  /** Movimientos de plata con fecha (person_money). Opcional: solo los que
   *  tienen `occurredOn` entran al hilo (sin fecha no se pueden ubicar). */
  money?: MoneyEntry[]
}

const INITIAL_VISIBLE = 12

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

/** Timestamp absoluto compacto: "vie 27 jun · 14:30". Sin año si es del año en
 *  curso. Sirve para responder "cuándo exactamente" al lado del "hace 2h",
 *  que Aaron pidió textualmente ("día y hora de cada cosa registrada"). */
const DOW_ABBR = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MON_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function formatAbsolute(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const day = `${DOW_ABBR[d.getDay()]} ${d.getDate()} ${MON_ABBR[d.getMonth()]}`
  const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''
  // Los moments guardan T00:00 (date-only) → no mostrar hora fake.
  const hourPart = hh === '00' && mm === '00' ? '' : ` · ${hh}:${mm}`
  return `${day}${year}${hourPart}`
}

export function Bitacora({ personLogs, observations, notesHistory, moments, money }: BitacoraProps) {
  const entries = useMemo(
    () => buildEntries(personLogs, observations, notesHistory ?? [], moments ?? [], money ?? []),
    [personLogs, observations, notesHistory, moments, money],
  )
  // Abierta por defecto cuando hay contenido — Aaron pidió VISIBILIDAD de lo
  // que registró en cada ficha. Vacía queda plegada para no gritar "hueco".
  const [open, setOpen] = useState(entries.length > 0)
  const [showAll, setShowAll] = useState(false)

  // Fuentes presentes (para los chips del filtro) en orden estable.
  const presentSources = useMemo(() => {
    const set = new Set(entries.map((e) => e.source))
    return SOURCE_ORDER.filter((s) => set.has(s))
  }, [entries])

  // Filtro por fuente: Set de fuentes OCULTAS (vacío = todo visible). Solo se
  // ofrece cuando hay ≥2 fuentes — con una sola no aporta.
  const [hidden, setHidden] = useState<Set<EntrySource>>(() => new Set())
  const toggleSource = (s: EntrySource) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })

  const filtered = hidden.size === 0 ? entries : entries.filter((e) => !hidden.has(e.source))
  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE)

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
                {/* Filtro por fuente: chips que enfocan el hilo. Solo con ≥2
                    fuentes presentes (con una no aporta). */}
                {presentSources.length >= 2 && (
                  <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por fuente">
                    {presentSources.map((s) => {
                      const on = !hidden.has(s)
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleSource(s)}
                          aria-pressed={on}
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors',
                            on
                              ? 'border-foreground/40 bg-secondary text-foreground'
                              : 'border-border text-muted-foreground/60 hover:text-foreground',
                          )}
                        >
                          {SOURCE_LABEL[s]}
                        </button>
                      )
                    })}
                  </div>
                )}

                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Nada con este filtro. Reactivá alguna fuente arriba.
                  </p>
                ) : (
                <ol className="relative space-y-2.5 border-l border-border/50 pl-4">
                  {visible.map((e) => (
                    <li key={e.id} className="relative">
                      <span
                        className={cn(
                          'absolute -left-[1.30rem] top-1.5 w-1.5 h-1.5 rounded-full',
                          e.source === 'log'
                            ? 'bg-brand/70'
                            : e.source === 'notes_history'
                              ? 'bg-warn/70'
                              : e.source === 'moment'
                                ? 'bg-bad/70'
                                : e.source === 'money'
                                  ? 'bg-ok/70'
                                  : 'bg-muted-foreground/50',
                        )}
                        aria-hidden="true"
                      />
                      <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider shrink-0">
                            {e.label}
                          </Badge>
                          {e.value && (
                            <span className="text-xs font-mono tabular-nums text-foreground truncate">{e.value}</span>
                          )}
                        </div>
                        <div className="flex flex-col items-end shrink-0 leading-tight">
                          <span
                            className="text-[10px] font-mono text-muted-foreground/70"
                            title={e.at}
                          >
                            {formatRelative(e.at)}
                          </span>
                          <span className="text-[9px] font-mono text-muted-foreground/50 tabular-nums">
                            {formatAbsolute(e.at)}
                          </span>
                        </div>
                      </div>
                      {e.detail && (
                        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{e.detail}</p>
                      )}
                      {e.obsId && (
                        <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                          <DiscardCaptureButton
                            observationId={e.obsId}
                            label="Descartar"
                            what={`Captura de ${e.label}`}
                            className="h-6 px-1.5 text-[10px]"
                          />
                          {e.needsResummary && (
                            <RebuildSummaryButton observationId={e.obsId} />
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
                )}

                {filtered.length > INITIAL_VISIBLE && (
                  <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)} className="mt-3 w-full">
                    <ChevronDown
                      size={13}
                      strokeWidth={1.75}
                      className={cn('mr-1.5 transition-transform', showAll && 'rotate-180')}
                    />
                    {showAll ? 'Ver menos' : `Ver todas (${filtered.length})`}
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
