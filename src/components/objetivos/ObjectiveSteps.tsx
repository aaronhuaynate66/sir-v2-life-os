'use client'
// SIR V2 — ObjectiveSteps (Hito 2 + 3): pasos accionables de UN objetivo.
//
// Hace que el objetivo deje de ser inerte: lista de pasos concretos que se
// pueden agregar / editar / reordenar / marcar (pendiente→en_progreso→hecho) /
// borrar. El progreso del objetivo se calcula del rollup hechos/total (lo
// sincroniza la página /objetivos a goal.progress cuando hay pasos).
//
// Hito 3: botón "Generar plan con IA" → POST /api/objectives/plan propone un
// plan ordenado con fechas. NO autoguarda: se revisa/edita/acepta o descarta
// (review-before-save, igual que las capturas) antes de persistir.

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import {
  Check,
  Circle,
  CircleDot,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  Sparkles,
  Loader2,
  X,
  Pencil,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { parseErrorResponse, type ApiError } from '@/lib/api/errors'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import {
  stepsForObjective,
  computeStepProgress,
  normalizeOrders,
  moveStep,
} from '@/lib/objectives/steps'
import { cn } from '@/lib/utils'
import type { Goal, ObjectiveStep, ObjectiveStepStatus } from '@/types'

const STATUS_META: Record<ObjectiveStepStatus, { icon: typeof Circle; cls: string; label: string }> = {
  pendiente: { icon: Circle, cls: 'text-muted-foreground/50', label: 'pendiente' },
  en_progreso: { icon: CircleDot, cls: 'text-warn', label: 'en progreso' },
  hecho: { icon: Check, cls: 'text-ok', label: 'hecho' },
}

/** Cicla el estado: pendiente → en_progreso → hecho → pendiente. */
function nextStatus(s: ObjectiveStepStatus): ObjectiveStepStatus {
  return s === 'pendiente' ? 'en_progreso' : s === 'en_progreso' ? 'hecho' : 'pendiente'
}

/** Paso propuesto por el LLM (aún no persistido). */
interface ProposedStep {
  title: string
  description?: string
  targetDate?: string
}

interface PlanState {
  loading: boolean
  proposed: ProposedStep[] | null
  error: ApiError | null
}

export function ObjectiveSteps({ goal }: { goal: Goal }) {
  const allSteps = useObjectiveStepStore((s) => s.steps)
  const addStep = useObjectiveStepStore((s) => s.addStep)
  const addSteps = useObjectiveStepStore((s) => s.addSteps)
  const updateStep = useObjectiveStepStore((s) => s.updateStep)
  const setStepStatus = useObjectiveStepStore((s) => s.setStepStatus)
  const removeStep = useObjectiveStepStore((s) => s.removeStep)
  const applyOrderChanges = useObjectiveStepStore((s) => s.applyOrderChanges)

  const steps = stepsForObjective(allSteps, goal.id)
  const progress = computeStepProgress(steps)

  // Alta de paso
  const [newTitle, setNewTitle] = useState('')
  const [newDate, setNewDate] = useState('')
  // Edición inline
  const [editId, setEditId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDate, setEditDate] = useState('')
  // Plan IA
  const [plan, setPlan] = useState<PlanState>({ loading: false, proposed: null, error: null })

  function makeStep(title: string, order: number, targetDate?: string, description?: string, salt = 0): ObjectiveStep {
    return {
      id: `os_${Date.now()}_${order}_${salt}`,
      objectiveId: goal.id,
      title: title.trim(),
      description: description?.trim() || undefined,
      targetDate: targetDate || undefined,
      status: 'pendiente',
      order,
      createdAt: new Date().toISOString(),
    }
  }

  function handleAdd() {
    const t = newTitle.trim()
    if (!t) {
      toast.error('Título requerido', { description: 'El paso no puede estar vacío.' })
      return
    }
    addStep(makeStep(t, steps.length, newDate || undefined))
    setNewTitle('')
    setNewDate('')
  }

  function startEdit(s: ObjectiveStep) {
    setEditId(s.id)
    setEditTitle(s.title)
    setEditDate(s.targetDate ?? '')
  }
  function saveEdit() {
    if (!editId) return
    const t = editTitle.trim()
    if (!t) {
      toast.error('Título requerido', { description: 'El paso no puede estar vacío.' })
      return
    }
    updateStep(editId, { title: t, targetDate: editDate || undefined })
    setEditId(null)
  }

  function handleMove(id: string, dir: 'up' | 'down') {
    applyOrderChanges(moveStep(steps, id, dir))
  }

  function handleRemove(s: ObjectiveStep) {
    removeStep(s.id)
    // Re-densificar el orden para no dejar huecos.
    const remaining = steps.filter((x) => x.id !== s.id)
    applyOrderChanges(normalizeOrders(remaining))
    toast.success('Paso eliminado', { description: s.title })
  }

  // ─── Hito 3: generar plan con IA ───────────────────────────────────
  const generatePlan = useCallback(async () => {
    setPlan({ loading: true, proposed: null, error: null })
    try {
      const res = await fetch('/api/objectives/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: goal.title,
          description: goal.description || undefined,
          category: goal.category,
          targetDate: goal.targetDate || undefined,
        }),
      })
      if (!res.ok) {
        setPlan({ loading: false, proposed: null, error: await parseErrorResponse(res) })
        return
      }
      const json = (await res.json()) as { steps: ProposedStep[] }
      setPlan({ loading: false, proposed: json.steps, error: null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setPlan({
        loading: false,
        proposed: null,
        error: { status: 0, message: 'Red caída o request abortado', detail: msg },
      })
    }
  }, [goal.title, goal.description, goal.category, goal.targetDate])

  function updateProposed(i: number, patch: Partial<ProposedStep>) {
    setPlan((p) =>
      p.proposed
        ? { ...p, proposed: p.proposed.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }
        : p,
    )
  }
  function removeProposed(i: number) {
    setPlan((p) => (p.proposed ? { ...p, proposed: p.proposed.filter((_, idx) => idx !== i) } : p))
  }
  function discardPlan() {
    setPlan({ loading: false, proposed: null, error: null })
  }
  function acceptPlan() {
    if (!plan.proposed || plan.proposed.length === 0) return
    const base = steps.length
    const toAdd = plan.proposed
      .filter((s) => s.title.trim())
      .map((s, i) => makeStep(s.title, base + i, s.targetDate, s.description, i))
    if (toAdd.length === 0) {
      toast.error('Plan vacío', { description: 'Ningún paso tenía título.' })
      return
    }
    addSteps(toAdd)
    discardPlan()
    toast.success('Plan agregado', { description: `${toAdd.length} pasos sumados al objetivo.` })
  }

  return (
    <div className="mt-3 border-t border-border/40 pt-3 space-y-3">
      {/* Rollup */}
      {progress && (
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
          {progress.done}/{progress.total} pasos · {progress.percent}%
        </div>
      )}

      {/* Lista de pasos */}
      {steps.length > 0 ? (
        <ul className="space-y-1">
          {steps.map((s, i) => {
            const meta = STATUS_META[s.status]
            const StatusIcon = meta.icon
            const editing = editId === s.id
            return (
              <li key={s.id} className="flex items-start gap-2 py-1">
                <button
                  type="button"
                  onClick={() => setStepStatus(s.id, nextStatus(s.status))}
                  className={cn('mt-0.5 flex-shrink-0 transition-colors hover:opacity-80', meta.cls)}
                  aria-label={`Estado: ${meta.label}. Click para cambiar.`}
                  title={meta.label}
                >
                  <StatusIcon size={16} strokeWidth={2} />
                </button>

                {editing ? (
                  <div className="flex-1 flex flex-col sm:flex-row gap-1.5">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="flex-1 h-8 text-sm"
                      placeholder="Título del paso"
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                    />
                    <Input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="h-8 w-full sm:w-36 font-mono text-xs"
                    />
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={saveEdit} className="h-8">Guardar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)} className="h-8">Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className={cn('text-sm', s.status === 'hecho' ? 'text-muted-foreground line-through' : 'text-foreground')}>
                        {s.title}
                      </div>
                      {s.description && (
                        <div className="text-[11px] text-muted-foreground/80 mt-0.5">{s.description}</div>
                      )}
                      {s.targetDate && (
                        <div className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">{s.targetDate}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMove(s.id, 'up')}
                        disabled={i === 0}
                        className="p-1 text-muted-foreground/50 hover:text-foreground disabled:opacity-25 disabled:hover:text-muted-foreground/50"
                        aria-label="Subir paso"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(s.id, 'down')}
                        disabled={i === steps.length - 1}
                        className="p-1 text-muted-foreground/50 hover:text-foreground disabled:opacity-25 disabled:hover:text-muted-foreground/50"
                        aria-label="Bajar paso"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(s)}
                        className="p-1 text-muted-foreground/50 hover:text-foreground"
                        aria-label="Editar paso"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(s)}
                        className="p-1 text-muted-foreground/50 hover:text-bad"
                        aria-label="Borrar paso"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground/70">
          Sin pasos todavía. Descomponé este objetivo en acciones concretas, o generá un plan con IA.
        </p>
      )}

      {/* Alta de paso */}
      <div className="flex flex-col sm:flex-row gap-1.5">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Nuevo paso…"
          className="flex-1 h-8 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="h-8 w-full sm:w-36 font-mono text-xs"
          aria-label="Fecha objetivo del paso (opcional)"
        />
        <Button size="sm" variant="outline" onClick={handleAdd} className="h-8">
          <Plus size={13} className="mr-1" />Agregar
        </Button>
      </div>

      {/* Generar plan con IA */}
      <div className="pt-1">
        {plan.error && <ApiErrorNotice error={plan.error} className="mb-2" />}
        {plan.loading ? (
          <div className="rounded-md border border-brand/20 bg-brand-soft p-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              Generando plan de pasos…
            </div>
          </div>
        ) : plan.proposed ? (
          <PlanReview
            proposed={plan.proposed}
            onChange={updateProposed}
            onRemove={removeProposed}
            onAccept={acceptPlan}
            onDiscard={discardPlan}
          />
        ) : (
          <Button size="sm" variant="outline" onClick={generatePlan} className="border-brand/30 text-brand-soft-foreground hover:bg-brand-soft">
            <Sparkles size={12} className="mr-2" />Generar plan con IA
          </Button>
        )}
      </div>
    </div>
  )
}

/** Review-before-save del plan generado: editable antes de persistir. */
function PlanReview({
  proposed,
  onChange,
  onRemove,
  onAccept,
  onDiscard,
}: {
  proposed: ProposedStep[]
  onChange: (i: number, patch: Partial<ProposedStep>) => void
  onRemove: (i: number) => void
  onAccept: () => void
  onDiscard: () => void
}) {
  return (
    <div className="rounded-md border border-brand/30 bg-brand-soft p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-brand-soft-foreground">
          <Sparkles size={13} />
          Plan propuesto · revisá, editá y aceptá (o descartá)
        </div>
        <button
          type="button"
          onClick={onDiscard}
          className="text-muted-foreground/60 hover:text-foreground"
          aria-label="Descartar plan"
        >
          <X size={14} />
        </button>
      </div>

      {proposed.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin pasos para guardar.</p>
      ) : (
        <ul className="space-y-2">
          {proposed.map((s, i) => (
            <li key={i} className="flex flex-col sm:flex-row gap-1.5 items-start">
              <span className="text-[10px] font-mono text-muted-foreground/60 mt-2 w-5 flex-shrink-0">{i + 1}.</span>
              <div className="flex-1 w-full space-y-1">
                <Input
                  value={s.title}
                  onChange={(e) => onChange(i, { title: e.target.value })}
                  className="h-8 text-sm"
                  placeholder="Título del paso"
                />
                {s.description && (
                  <Input
                    value={s.description}
                    onChange={(e) => onChange(i, { description: e.target.value })}
                    className="h-7 text-xs text-muted-foreground"
                    placeholder="Detalle"
                  />
                )}
              </div>
              <Input
                type="date"
                value={s.targetDate ?? ''}
                onChange={(e) => onChange(i, { targetDate: e.target.value || undefined })}
                className="h-8 w-full sm:w-36 font-mono text-xs"
                aria-label={`Fecha sugerida paso ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="p-1.5 text-muted-foreground/50 hover:text-bad flex-shrink-0"
                aria-label={`Quitar paso ${i + 1} del plan`}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={onAccept}
          className="border-ok/30 bg-ok-soft text-ok-foreground hover:bg-ok/20 hover:text-ok-foreground"
        >
          Aceptar plan ({proposed.length})
        </Button>
        <Button size="sm" variant="ghost" onClick={onDiscard}>Descartar</Button>
      </div>
    </div>
  )
}
