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
import type { Goal, Memory, Person, Relationship } from '@/types'

export interface AlignmentPanelProps {
  goals: Goal[]
  people: Person[]
  relationships: Relationship[]
  /** Memorias derivadas (tags estructurados): habilitan las señales tagged. */
  memories?: Memory[]
}

const STATE_META: Record<AlignmentState, { label: string; chip: string; dot: string }> = {
  aligned: {
    label: 'Alineado',
    chip: 'border-ok/30 bg-ok-soft text-ok-foreground',
    dot: 'bg-ok',
  },
  drifting: {
    label: 'A la deriva',
    chip: 'border-warn/30 bg-warn-soft text-warn-foreground',
    dot: 'bg-warn',
  },
  needs_attention: {
    label: 'Necesita atención',
    chip: 'border-bad/30 bg-bad-soft text-bad-foreground',
    dot: 'bg-bad',
  },
  no_recent_signal: {
    label: 'Sin señales recientes',
    chip: 'border-border bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/40',
  },
  insufficient_data: {
    label: 'Datos insuficientes',
    chip: 'border-border bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/40',
  },
}

const CONCERN_DOT: Record<ConcernLevel, string> = {
  0: 'bg-ok',
  1: 'bg-warn',
  2: 'bg-bad',
}

interface NarrativeState {
  loading: boolean
  insight: string | null
  error: ApiError | null
}

/** Placeholder mientras el LLM redacta la reflexión (en vez de solo el spinner). */
function ReflectionSkeleton() {
  return (
    <div className="rounded-md border border-brand/20 bg-brand-soft p-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70 mb-2">
        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
        Generando reflexión…
      </div>
      <div className="space-y-2 animate-pulse" aria-hidden="true">
        <div className="h-3 w-full bg-muted/50 rounded" />
        <div className="h-3 w-4/5 bg-muted/50 rounded" />
      </div>
    </div>
  )
}

export function AlignmentPanel({ goals, people, relationships, memories }: AlignmentPanelProps) {
  const alignments = useMemo(
    () => computeAlignments(goals, { people, relationships, memories }),
    [goals, people, relationships, memories],
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
          signals: a.signals.map((s) => ({ label: s.label, concern: s.concern, detail: s.detail })),
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
            const canReflect = a.state !== 'insufficient_data' && a.state !== 'no_recent_signal'
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
                  <ul className="space-y-1.5">
                    {a.signals.map((s, i) => (
                      <li key={`${a.goalId}-${i}`} className="text-xs text-foreground/90">
                        <div className="flex items-center gap-2">
                          <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', CONCERN_DOT[s.concern])} aria-hidden="true" />
                          {s.label}
                        </div>
                        {s.detail && (
                          <p className="text-[11px] text-muted-foreground/70 italic leading-relaxed pl-3.5 mt-0.5">
                            “{s.detail}”
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {canReflect && (
                  <div className="pt-1">
                    {n?.error && <ApiErrorNotice error={n.error} className="mb-2" />}
                    {n?.loading ? (
                      <ReflectionSkeleton />
                    ) : n?.insight ? (
                      <div className="rounded-md border border-brand/30 bg-brand-soft p-3 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-brand-soft-foreground leading-relaxed">{n.insight}</p>
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
                      <Button size="sm" variant="outline" onClick={() => generate(a)}>
                        <Sparkles size={12} className="mr-2" />Generar reflexión
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
