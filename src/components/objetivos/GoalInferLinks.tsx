'use client'
// SIR V2 — GoalInferLinks (Etapa 4: Identity & Alignment — cierre del MVP)
//
// Puente OPT-IN / ON-DEMAND para OBJETIVOS SUELTOS: los que no tienen ninguna
// persona vinculada (ni inferida por evidencia) quedan fuera del Alignment
// Engine a propósito, para no inventar una brecha. Acá el usuario puede, si
// quiere, pedirle a SIR que SUGIERA a qué dominio y a qué de sus contactos se
// refiere un objetivo — y confirmar/editar antes de aplicar.
//
// Doble opt-in (respeta que "la mayoría de los objetivos no involucran a nadie"):
//   1) el panel arranca COLAPSADO,
//   2) dentro, cada objetivo tiene su propio botón "Sugerir con IA".
// Nada se auto-aplica: la sugerencia prefilla chips editables; el vínculo se
// escribe solo al tocar "Aplicar". El guardrail anti-invención vive en el
// parser del server (solo nombres de contactos reales).

import { useCallback, useMemo, useState } from 'react'
import { ChevronRight, Link2, Loader2, Sparkles, X } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionTitle } from '@/components/ui/section-title'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { parseErrorResponse, type ApiError } from '@/lib/api/errors'
import { togglePersonId } from '@/lib/goals/relatedPersons'
import { CAT_LABEL } from '@/components/objetivos/goalMeta'
import { cn } from '@/lib/utils'
import type { Goal, GoalCategory, Person } from '@/types'

export interface GoalInferLinksProps {
  goals: Goal[]
  people: Person[]
  /** Aplica el vínculo confirmado (no auto-aplicado): personas + dominio opcional. */
  onApply: (goalId: string, personIds: string[], category?: GoalCategory) => void
}

interface Suggestion {
  loading: boolean
  error: ApiError | null
  /** Ids de contactos propuestos + editables (toggle). */
  selectedIds: string[]
  /** Dominio sugerido, editable. undefined = no tocar el actual. */
  category?: GoalCategory
  reasoning: string
  confident: boolean
  /** true una vez que llegó respuesta (aunque sea vacía). */
  loaded: boolean
}

const EMPTY: Suggestion = { loading: false, error: null, selectedIds: [], reasoning: '', confident: false, loaded: false }

export function GoalInferLinks({ goals, people, onApply }: GoalInferLinksProps) {
  const [open, setOpen] = useState(false)
  const [byGoal, setByGoal] = useState<Record<string, Suggestion>>({})

  // Objetivos ACTIVOS sin ninguna persona vinculada: los candidatos a inferir.
  const looseGoals = useMemo(
    () => goals.filter((g) => g.status === 'active' && (g.relatedPersons?.length ?? 0) === 0),
    [goals],
  )

  const nameById = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people])

  const suggest = useCallback(
    async (goal: Goal) => {
      setByGoal((prev) => ({ ...prev, [goal.id]: { ...EMPTY, loading: true } }))
      try {
        const res = await fetch('/api/alignment/infer-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: goal.title,
            description: goal.description,
            target: goal.target,
            why: goal.why,
            candidateNames: people.map((p) => p.name),
          }),
        })
        if (!res.ok) {
          const error = await parseErrorResponse(res)
          setByGoal((prev) => ({ ...prev, [goal.id]: { ...EMPTY, error, loaded: true } }))
          return
        }
        const json = (await res.json()) as {
          inference: { personNames: string[]; category: GoalCategory | null; reasoning: string; confident: boolean }
        }
        const inf = json.inference
        // Mapear nombres canónicos (ya filtrados por el server a contactos reales)
        // de vuelta a ids. Match exacto case/acento-insensible.
        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
        const wanted = new Set(inf.personNames.map(norm))
        const selectedIds = people.filter((p) => wanted.has(norm(p.name))).map((p) => p.id)
        setByGoal((prev) => ({
          ...prev,
          [goal.id]: {
            loading: false,
            error: null,
            selectedIds,
            category: inf.category ?? undefined,
            reasoning: inf.reasoning,
            confident: inf.confident,
            loaded: true,
          },
        }))
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        setByGoal((prev) => ({
          ...prev,
          [goal.id]: { ...EMPTY, error: { status: 0, message: 'Red caída o request abortado', detail: message }, loaded: true },
        }))
      }
    },
    [people],
  )

  const toggle = useCallback((goalId: string, personId: string) => {
    setByGoal((prev) => {
      const s = prev[goalId]
      if (!s) return prev
      return { ...prev, [goalId]: { ...s, selectedIds: togglePersonId(s.selectedIds, personId) } }
    })
  }, [])

  const setCategory = useCallback((goalId: string, category: GoalCategory) => {
    setByGoal((prev) => {
      const s = prev[goalId]
      if (!s) return prev
      return { ...prev, [goalId]: { ...s, category } }
    })
  }, [])

  const dismiss = useCallback((goalId: string) => {
    setByGoal((prev) => {
      const next = { ...prev }
      delete next[goalId]
      return next
    })
  }, [])

  const apply = useCallback(
    (goal: Goal) => {
      const s = byGoal[goal.id]
      if (!s) return
      const category = s.category && s.category !== goal.category ? s.category : undefined
      onApply(goal.id, s.selectedIds, category)
      dismiss(goal.id)
    },
    [byGoal, onApply, dismiss],
  )

  // Sin objetivos sueltos, o sin contactos para sugerir → no aplica.
  if (looseGoals.length === 0 || people.length === 0) return null

  return (
    <Card className="shadow-none mb-6">
      <CardContent className="p-4 sm:p-6">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <SectionTitle icon={Link2} label="¿Algún objetivo suelto involucra a alguien?" />
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono">{looseGoals.length}</Badge>
            <ChevronRight size={16} className={cn('text-muted-foreground transition-transform', open && 'rotate-90')} />
          </div>
        </button>

        {open && (
          <>
            <p className="text-xs text-muted-foreground mt-2 mb-4 leading-relaxed">
              Estos objetivos no tienen a nadie vinculado. La mayoría no involucra a nadie — y está bien.
              Si alguno sí, SIR puede sugerir a quién y a qué dominio se refiere. Es una propuesta
              editable: nada se aplica hasta que confirmes.
            </p>

            <div className="space-y-3">
              {looseGoals.map((g) => {
                const s = byGoal[g.id]
                return (
                  <div key={g.id} className="rounded-md border border-border/60 bg-muted/10 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{g.title}</div>
                        <div className="text-[11px] text-muted-foreground/80 mt-0.5">
                          dominio actual: {CAT_LABEL[g.category]}
                        </div>
                      </div>
                      {!s && (
                        <Button size="sm" variant="outline" onClick={() => suggest(g)}>
                          <Sparkles size={12} className="mr-2" />Sugerir con IA
                        </Button>
                      )}
                    </div>

                    {s?.loading && (
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
                        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                        Leyendo el objetivo…
                      </div>
                    )}

                    {s?.error && <ApiErrorNotice error={s.error} />}

                    {s?.loaded && !s.error && (
                      <div className="rounded-md border border-brand/20 bg-brand-soft/20 p-3 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">
                            <Sparkles size={11} className="inline mr-1" />Propuesta de SIR — revisá y ajustá
                          </p>
                          <button
                            type="button"
                            onClick={() => dismiss(g.id)}
                            className="text-muted-foreground/60 hover:text-foreground flex-shrink-0"
                            aria-label="Descartar sugerencia"
                          >
                            <X size={13} strokeWidth={1.75} />
                          </button>
                        </div>

                        {s.reasoning && <p className="text-xs text-foreground/90 leading-relaxed">{s.reasoning}</p>}

                        {!s.confident && (
                          <p className="text-[11px] text-warn leading-relaxed">
                            SIR no está seguro de este objetivo. Tomalo como una corazonada a confirmar, no como un dato.
                          </p>
                        )}

                        {/* Personas propuestas (editables): toggle sobre TODOS los contactos,
                            con los sugeridos pre-marcados. */}
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.07em] text-text-tertiary mb-1.5">
                            Personas {s.selectedIds.length > 0 && <span className="text-muted-foreground/60 normal-case">· {s.selectedIds.length} sugerida(s)</span>}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {people.map((p) => {
                              const active = s.selectedIds.includes(p.id)
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => toggle(g.id, p.id)}
                                  aria-pressed={active}
                                  className={cn(
                                    'text-[11px] rounded-full border px-2.5 py-0.5 transition-colors',
                                    active
                                      ? 'border-accent/50 bg-accent/10 text-foreground'
                                      : 'border-border text-muted-foreground hover:border-accent/40 hover:text-foreground',
                                  )}
                                >
                                  {p.name}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Dominio sugerido (editable). */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase tracking-[0.07em] text-text-tertiary">Dominio</span>
                          <Select
                            value={s.category ?? g.category}
                            onValueChange={(v) => setCategory(g.id, v as GoalCategory)}
                          >
                            <SelectTrigger className="h-7 w-[9rem] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(Object.keys(CAT_LABEL) as GoalCategory[]).map((c) => (
                                <SelectItem key={c} value={c}>{CAT_LABEL[c]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center gap-2 pt-0.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => apply(g)}
                            disabled={s.selectedIds.length === 0 && (!s.category || s.category === g.category)}
                          >
                            Aplicar vínculo
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => dismiss(g.id)}>Descartar</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
