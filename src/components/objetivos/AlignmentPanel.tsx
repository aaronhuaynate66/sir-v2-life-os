'use client'
// SIR V2 — AlignmentPanel (Etapa 4: Identity & Alignment) — MVP
//
// Muestra, por objetivo ACTIVO: lo DECLARADO (título + dominio), las SEÑALES
// observadas reales y el ESTADO de alineación derivado por el engine puro.
// Botón opcional "Generar reflexión" → POST /api/alignment/narrative (Anthropic
// sólo reformula las señales reales). El insight es revisable y descartable
// (principio #3: la IA asiste, no controla).
//
// El veredicto se computa client-side desde los stores (goals + people +
// relationships) → sin red para el estado; la red sólo entra para la narrativa.

import { useCallback, useMemo, useState } from 'react'
import { Compass, Loader2, Sparkles, X } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { parseErrorResponse, type ApiError } from '@/lib/api/errors'
import { SectionTitle } from '@/components/ui/section-title'
import { cn } from '@/lib/utils'
import { computeAlignments, type AlignmentState, type GoalAlignment, type ConcernLevel } from '@/engines/alignment'
import type { Goal, Person, Relationship } from '@/types'

export interface AlignmentPanelProps {
  goals: Goal[]
  people: Person[]
  relationships: Relationship[]
}

const STATE_META: Record<AlignmentState, { label: string; chip: string; dot: string }> = {
  aligned: {
    label: 'Alineado',
    chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    dot: 'bg-emerald-500',
  },
  drifting: {
    label: 'A la deriva',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    dot: 'bg-amber-500',
  },
  needs_attention: {
    label: 'Necesita atención',
    chip: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
    dot: 'bg-rose-500',
  },
  insufficient_data: {
    label: 'Datos insuficientes',
    chip: 'border-border bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/40',
  },
}

const CONCERN_DOT: Record<ConcernLevel, string> = {
  0: 'bg-emerald-500',
  1: 'bg-amber-500',
  2: 'bg-rose-500',
}

interface NarrativeState {
  loading: boolean
  insight: string | null
  error: ApiError | null
}

export function AlignmentPanel({ goals, people, relationships }: AlignmentPanelProps) {
  const alignments = useMemo(
    () => computeAlignments(goals, { people, relationships }),
    [goals, people, relationships],
  )
  // Solo objetivos con ≥1 PERSONA vinculada: comparar "lo declarado vs el
  // comportamiento observado" solo tiene sentido ahí. Vincular personas es
  // OPCIONAL — la mayoría de los objetivos personales no involucran a nadie, y
  // ese es el punto. No los tratamos como "datos insuficientes" ni los listamos.
  const linkedAlignments = useMemo(
    () => alignments.filter((a) => a.linkedPersonNames.length > 0),
    [alignments],
  )
  const [narratives, setNarratives] = useState<Record<string, NarrativeState>>({})

  const generate = useCallback(async (a: GoalAlignment) => {
    setNarratives((prev) => ({ ...prev, [a.goalId]: { loading: true, insight: null, error: null } }))
    try {
      const res = await fetch('/api/alignment/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: a.title,
          category: a.category,
          state: a.state,
          linkedPersonNames: a.linkedPersonNames,
          signals: a.signals.map((s) => ({ label: s.label, concern: s.concern })),
        }),
      })
      if (!res.ok) {
        const apiError = await parseErrorResponse(res)
        setNarratives((prev) => ({
          ...prev,
          [a.goalId]: { loading: false, insight: null, error: apiError },
        }))
        return
      }
      const json = (await res.json()) as { insight: string }
      setNarratives((prev) => ({
        ...prev,
        [a.goalId]: { loading: false, insight: json.insight, error: null },
      }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setNarratives((prev) => ({
        ...prev,
        [a.goalId]: { loading: false, insight: null, error: { status: 0, message: 'Red caída o request abortado', detail: msg } },
      }))
    }
  }, [])

  const dismiss = useCallback((goalId: string) => {
    setNarratives((prev) => {
      const next = { ...prev }
      delete next[goalId]
      return next
    })
  }, [])

  // Sin objetivos con personas vinculadas → la sección no aplica: se oculta
  // por completo (nada de listar todo con "datos insuficientes").
  if (linkedAlignments.length === 0) return null

  return (
    <Card className="shadow-none mb-6">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-1">
          <SectionTitle icon={Compass} label="Alineación" />
          <Badge variant="outline" className="text-[10px] font-mono">{linkedAlignments.length}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Solo para los objetivos donde vinculaste personas: cómo se compara lo que declaraste querer
          con tu comportamiento observado. Son observaciones para reflexionar — la IA asiste, no juzga.
          Podés descartarlas.
        </p>

        <div className="space-y-3">
          {linkedAlignments.map((a) => {
            const meta = STATE_META[a.state]
            const n = narratives[a.goalId]
            const canReflect = a.state !== 'insufficient_data'
            return (
              <div key={a.goalId} className="rounded-md border border-border/60 bg-muted/10 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{a.title}</div>
                    {a.linkedPersonNames.length > 0 && (
                      <div className="text-[11px] text-muted-foreground/80 mt-0.5">
                        vínculo: {a.linkedPersonNames.join(', ')}
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] font-normal flex-shrink-0', meta.chip)}>
                    {meta.label}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">{a.summary}</p>

                {a.signals.length > 0 && (
                  <ul className="space-y-1">
                    {a.signals.map((s, i) => (
                      <li key={`${a.goalId}-${i}`} className="flex items-center gap-2 text-xs text-foreground/90">
                        <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', CONCERN_DOT[s.concern])} aria-hidden="true" />
                        {s.label}
                      </li>
                    ))}
                  </ul>
                )}

                {canReflect && (
                  <div className="pt-1">
                    {n?.error && <ApiErrorNotice error={n.error} className="mb-2" />}
                    {n?.insight ? (
                      <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-violet-100/90 leading-relaxed">{n.insight}</p>
                          <button
                            type="button"
                            onClick={() => dismiss(a.goalId)}
                            className="text-muted-foreground/60 hover:text-foreground flex-shrink-0"
                            aria-label="Descartar reflexión"
                          >
                            <X size={13} strokeWidth={1.75} />
                          </button>
                        </div>
                        <div className="text-[10px] text-muted-foreground/60 mt-2">
                          Una perspectiva para mirar, no un veredicto. Descartá si no resuena.
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => generate(a)} disabled={n?.loading}>
                        {n?.loading ? (
                          <><Loader2 size={12} className="mr-2 animate-spin" />Generando…</>
                        ) : (
                          <><Sparkles size={12} className="mr-2" />Generar reflexión</>
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
