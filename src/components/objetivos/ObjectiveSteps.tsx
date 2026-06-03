'use client'
// SIR V2 — ObjectiveSteps (OKR, fase 2): plan jerárquico de UN objetivo.
//
// Modelo OKR/agile: Objetivo → Resultados Clave (KR) → Tareas. El objetivo deja
// de ser inerte y de tener "pasos sueltos": se descompone en KRs medibles, y
// cada KR en tareas concretas (las hojas accionables).
//
//   - KR  : outcome medible. Su progreso = rollup de sus tareas (o su propio
//           status si todavía no tiene tareas). No se "marca hecho" a mano si
//           tiene tareas (es derivado).
//   - Tarea: acción logística concreta. Se cicla pendiente→en_progreso→hecho.
//
// Progreso del objetivo = rollup de sus KRs (promedio de % de cada KR). Lo
// sincroniza /objetivos a goal.progress cuando hay KRs.
//
// "Generar plan con IA" (fase 4) reescribe el plan completo (KRs + tareas);
// hasta entonces convive un plan plano que aterriza como KRs sin tareas.

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Check,
  Circle,
  CircleDot,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  Sparkles,
  Loader2,
  X,
  Pencil,
  Target,
  Gauge,
  CalendarClock,
  Lock,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { parseErrorResponse, withTimeoutHint, type ApiError } from '@/lib/api/errors'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useSelfStore } from '@/stores/useSelfStore'
import { useSignalStore } from '@/stores/useSignalStore'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import {
  keyResultsForObjective,
  tasksForKeyResult,
  computeObjectiveProgress,
  computeKeyResultProgress,
  normalizeOrders,
  moveStep,
  isTask,
  effectiveTaskStatus,
  blockedByIncomplete,
  wouldCreateDependencyCycle,
  taskStatusPatch,
  daysUntilStep,
} from '@/lib/objectives/steps'
import {
  TASK_STATUS_META,
  StatusControl,
  EffortControl,
  PriorityControl,
  EffortChip,
  PriorityChip,
  nextTaskStatus,
} from '@/components/objetivos/taskFields'
import type { ProposedKeyResult, ProposedTask } from '@/lib/objectives/planPrompt'
import { buildGroundingContext, renderGroundingForPrompt } from '@/lib/objectives/grounding'
import { cn } from '@/lib/utils'
import type {
  Goal,
  ObjectiveStep,
  ObjectiveStepKind,
  ObjectiveStepStatus,
  TaskStatus,
  TaskEffort,
  TaskPriority,
} from '@/types'

const STATUS_META: Record<ObjectiveStepStatus, { icon: typeof Circle; cls: string; label: string }> = {
  pendiente: { icon: Circle, cls: 'text-text-tertiary', label: 'pendiente' },
  en_progreso: { icon: CircleDot, cls: 'text-warn', label: 'en progreso' },
  hecho: { icon: Check, cls: 'text-ok', label: 'hecho' },
}

/** Cicla el estado del KR: pendiente → en_progreso → hecho → pendiente. */
function nextStatus(s: ObjectiveStepStatus): ObjectiveStepStatus {
  return s === 'pendiente' ? 'en_progreso' : s === 'en_progreso' ? 'hecho' : 'pendiente'
}

interface PlanState {
  loading: boolean
  /** Plan OKR propuesto por el LLM (KRs con tareas), aún no persistido. */
  proposed: ProposedKeyResult[] | null
  /** Notas de feasibility aterrizadas en la data real (Hito B). */
  feasibility: string[]
  error: ApiError | null
}

export function ObjectiveSteps({
  goal,
  smartComplete,
  onRequestDefine,
  autoGenerate = false,
  onAutoGenerateConsumed,
}: {
  goal: Goal
  /** ¿El objetivo está bien definido (SMART)? Gatea la generación de plan IA. */
  smartComplete: boolean
  /** Abre el wizard de definición (cuando el objetivo aún no es SMART). */
  onRequestDefine: () => void
  /** Disparo externo (desde el CTA de la tarjeta) para generar el plan al abrir. */
  autoGenerate?: boolean
  /** Avisa al padre que ya consumimos el disparo (para que limpie el flag). */
  onAutoGenerateConsumed?: () => void
}) {
  const allSteps = useObjectiveStepStore((s) => s.steps)
  const addStep = useObjectiveStepStore((s) => s.addStep)
  const addSteps = useObjectiveStepStore((s) => s.addSteps)
  const updateStep = useObjectiveStepStore((s) => s.updateStep)
  const setStepStatus = useObjectiveStepStore((s) => s.setStepStatus)
  const setTaskStatus = useObjectiveStepStore((s) => s.setTaskStatus)
  const removeStep = useObjectiveStepStore((s) => s.removeStep)
  const applyOrderChanges = useObjectiveStepStore((s) => s.applyOrderChanges)

  // Grounding: data real para que el plan y la feasibility se apoyen en SIR.
  const financialMovements = useFinanceStore((s) => s.financialMovements)
  const healthMetrics = useSelfStore((s) => s.healthMetrics)
  const selfMetrics = useSelfStore((s) => s.selfMetrics)
  const signals = useSignalStore((s) => s.signals)
  const people = useRelationshipStore((s) => s.people)

  const keyResults = keyResultsForObjective(allSteps, goal.id)
  const progress = computeObjectiveProgress(allSteps, goal.id)

  // Alta de KR
  const [newKrTitle, setNewKrTitle] = useState('')
  // Edición inline (compartida KR/tarea: los ids son únicos)
  const [editId, setEditId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDate, setEditDate] = useState('')
  // Expand/colapso de KRs (por defecto expandidos → se ven las tareas)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // Plan IA
  const [plan, setPlan] = useState<PlanState>({ loading: false, proposed: null, feasibility: [], error: null })

  const makeStep = useCallback(
    (opts: {
      title: string
      kind: ObjectiveStepKind
      order: number
      parentId?: string
      targetDate?: string
      description?: string
      acceptanceCriteria?: string
      effort?: TaskEffort
      priority?: TaskPriority
      salt?: number
    }): ObjectiveStep => ({
      id: `os_${Date.now()}_${opts.kind === 'task' ? 't' : 'k'}_${opts.order}_${opts.salt ?? 0}`,
      objectiveId: goal.id,
      kind: opts.kind,
      parentId: opts.parentId,
      title: opts.title.trim(),
      description: opts.description?.trim() || undefined,
      targetDate: opts.targetDate || undefined,
      status: 'pendiente',
      order: opts.order,
      createdAt: new Date().toISOString(),
      // Campos Jira-light: sólo tienen sentido en tareas (los KRs los dejan vacíos).
      acceptanceCriteria: opts.kind === 'task' ? opts.acceptanceCriteria?.trim() || undefined : undefined,
      effort: opts.kind === 'task' ? opts.effort : undefined,
      priority: opts.kind === 'task' ? opts.priority : undefined,
      taskStatus: opts.kind === 'task' ? 'todo' : undefined,
    }),
    [goal.id],
  )

  // ─── KRs ───────────────────────────────────────────────────────────
  function handleAddKr() {
    const t = newKrTitle.trim()
    if (!t) {
      toast.error('Título requerido', { description: 'El resultado clave no puede estar vacío.' })
      return
    }
    addStep(makeStep({ title: t, kind: 'key_result', order: keyResults.length }))
    setNewKrTitle('')
  }

  function handleMoveKr(id: string, dir: 'up' | 'down') {
    applyOrderChanges(moveStep(keyResults, id, dir))
  }

  function handleRemoveKr(kr: ObjectiveStep) {
    const tasks = tasksForKeyResult(allSteps, kr.id)
    tasks.forEach((t) => removeStep(t.id)) // limpiar hijas localmente (la DB cascada).
    removeStep(kr.id)
    const remaining = keyResults.filter((x) => x.id !== kr.id)
    applyOrderChanges(normalizeOrders(remaining))
    toast.success('Resultado clave eliminado', { description: kr.title })
  }

  // ─── Tareas ──────────────────────────────────────────────────────────
  function handleAddTask(kr: ObjectiveStep, title: string, date: string) {
    const t = title.trim()
    if (!t) {
      toast.error('Título requerido', { description: 'La tarea no puede estar vacía.' })
      return
    }
    const siblings = tasksForKeyResult(allSteps, kr.id)
    addStep(
      makeStep({ title: t, kind: 'task', parentId: kr.id, order: siblings.length, targetDate: date || undefined }),
    )
  }

  function handleMoveTask(kr: ObjectiveStep, id: string, dir: 'up' | 'down') {
    applyOrderChanges(moveStep(tasksForKeyResult(allSteps, kr.id), id, dir))
  }

  function handleRemoveTask(kr: ObjectiveStep, task: ObjectiveStep) {
    removeStep(task.id)
    const remaining = tasksForKeyResult(allSteps, kr.id).filter((x) => x.id !== task.id)
    applyOrderChanges(normalizeOrders(remaining))
    toast.success('Tarea eliminada', { description: task.title })
  }

  // ─── Edición inline (KR o tarea) ─────────────────────────────────────
  function startEdit(s: ObjectiveStep) {
    setEditId(s.id)
    setEditTitle(s.title)
    setEditDate(s.targetDate ?? '')
  }
  function saveEdit() {
    if (!editId) return
    const t = editTitle.trim()
    if (!t) {
      toast.error('Título requerido', { description: 'No puede quedar vacío.' })
      return
    }
    updateStep(editId, { title: t, targetDate: editDate || undefined })
    setEditId(null)
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Plan IA (OKR completo + feasibility, apoyado en data real) ──────
  const generatePlan = useCallback(async () => {
    setPlan({ loading: true, proposed: null, feasibility: [], error: null })
    try {
      // Grounding: resumimos la data real del usuario (client-side, sin N+1) y
      // mandamos sólo el texto resumido (no filas crudas; sin self_diagnosis).
      const linkedPeople = (goal.relatedPersons ?? [])
        .map((id) => people.find((p) => p.id === id)?.name)
        .filter((n): n is string => !!n)
      const ctx = buildGroundingContext({
        financialMovements,
        healthMetrics,
        selfMetrics,
        signals,
        linkedPeople,
      })
      const context = renderGroundingForPrompt(ctx)

      const res = await fetch('/api/objectives/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: goal.title,
          description: goal.description || undefined,
          category: goal.category,
          targetDate: goal.targetDate || undefined,
          target: goal.target || undefined,
          baseline: goal.baseline || undefined,
          why: goal.why || undefined,
          context: context || undefined,
        }),
      })
      if (!res.ok) {
        setPlan({ loading: false, proposed: null, feasibility: [], error: withTimeoutHint(await parseErrorResponse(res)) })
        return
      }
      const json = (await res.json()) as { keyResults: ProposedKeyResult[]; feasibility?: string[] }
      setPlan({ loading: false, proposed: json.keyResults, feasibility: json.feasibility ?? [], error: null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setPlan({
        loading: false,
        proposed: null,
        feasibility: [],
        error: { status: 0, message: 'Red caída o request abortado', detail: msg },
      })
    }
  }, [
    goal.title,
    goal.description,
    goal.category,
    goal.targetDate,
    goal.target,
    goal.baseline,
    goal.why,
    goal.relatedPersons,
    financialMovements,
    healthMetrics,
    selfMetrics,
    signals,
    people,
  ])

  // Disparo externo: el CTA de la tarjeta abre el panel y pide generar el plan
  // de una. Consumimos el flag primero (para no re-disparar) y sólo generamos si
  // el objetivo ya es SMART y no hay una generación/propuesta en curso.
  useEffect(() => {
    if (!autoGenerate) return
    onAutoGenerateConsumed?.()
    if (smartComplete && !plan.loading && !plan.proposed) void generatePlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, smartComplete])

  function updateProposedKr(i: number, patch: Partial<Omit<ProposedKeyResult, 'tasks'>>) {
    setPlan((p) =>
      p.proposed
        ? { ...p, proposed: p.proposed.map((kr, idx) => (idx === i ? { ...kr, ...patch } : kr)) }
        : p,
    )
  }
  function removeProposedKr(i: number) {
    setPlan((p) => (p.proposed ? { ...p, proposed: p.proposed.filter((_, idx) => idx !== i) } : p))
  }
  function updateProposedTask(i: number, j: number, patch: Partial<ProposedTask>) {
    setPlan((p) =>
      p.proposed
        ? {
            ...p,
            proposed: p.proposed.map((kr, idx) =>
              idx === i
                ? { ...kr, tasks: kr.tasks.map((t, tj) => (tj === j ? { ...t, ...patch } : t)) }
                : kr,
            ),
          }
        : p,
    )
  }
  function removeProposedTask(i: number, j: number) {
    setPlan((p) =>
      p.proposed
        ? {
            ...p,
            proposed: p.proposed.map((kr, idx) =>
              idx === i ? { ...kr, tasks: kr.tasks.filter((_, tj) => tj !== j) } : kr,
            ),
          }
        : p,
    )
  }
  function discardPlan() {
    setPlan({ loading: false, proposed: null, feasibility: [], error: null })
  }
  function acceptPlan() {
    if (!plan.proposed || plan.proposed.length === 0) return
    const base = keyResults.length
    const toAdd: ObjectiveStep[] = []
    plan.proposed.forEach((krp, i) => {
      if (!krp.title.trim()) return
      const krStep = makeStep({
        title: krp.title,
        kind: 'key_result',
        order: base + i,
        description: krp.description,
        salt: i,
      })
      toAdd.push(krStep)
      krp.tasks.forEach((tp, j) => {
        if (!tp.title.trim()) return
        toAdd.push(
          makeStep({
            title: tp.title,
            kind: 'task',
            parentId: krStep.id,
            order: j,
            targetDate: tp.targetDate,
            description: tp.description,
            acceptanceCriteria: tp.acceptanceCriteria,
            effort: tp.effort,
            priority: tp.priority,
            salt: i * 100 + j,
          }),
        )
      })
    })
    if (toAdd.length === 0) {
      toast.error('Plan vacío', { description: 'Ningún resultado clave tenía título.' })
      return
    }
    const krCount = toAdd.filter((s) => s.kind === 'key_result').length
    const taskCount = toAdd.length - krCount
    addSteps(toAdd)
    discardPlan()
    toast.success('Plan agregado', {
      description: `${krCount} resultados clave y ${taskCount} tareas sumadas.`,
    })
  }

  return (
    <div className="mt-3 border-t border-border/40 pt-3 space-y-3">
      {/* Rollup del objetivo */}
      {progress && (
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
          {progress.done}/{progress.total} resultados clave · {progress.percent}%
        </div>
      )}

      {/* Lista de KRs */}
      {keyResults.length > 0 ? (
        <ul className="space-y-2">
          {keyResults.map((kr, i) => (
            <KeyResultRow
              key={kr.id}
              kr={kr}
              tasks={tasksForKeyResult(allSteps, kr.id)}
              allSteps={allSteps}
              index={i}
              total={keyResults.length}
              expanded={!collapsed.has(kr.id)}
              editId={editId}
              editTitle={editTitle}
              onToggleCollapse={() => toggleCollapse(kr.id)}
              onMoveKr={handleMoveKr}
              onRemoveKr={handleRemoveKr}
              onCycleKrStatus={(id, st) => setStepStatus(id, st)}
              onStartEdit={startEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditId(null)}
              onEditTitle={setEditTitle}
              onAddTask={handleAddTask}
              onMoveTask={handleMoveTask}
              onRemoveTask={handleRemoveTask}
              onSetTaskStatus={(id, ts) => setTaskStatus(id, ts)}
              onSaveTaskEdit={(id, patch) => {
                updateStep(id, patch)
                setEditId(null)
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground/70">
          Sin resultados clave todavía. Descomponé este objetivo en outcomes medibles (KRs) y, bajo
          cada uno, tareas concretas — o generá un plan con IA.
        </p>
      )}

      {/* Alta de KR */}
      <div className="flex flex-col sm:flex-row gap-1.5">
        <Input
          value={newKrTitle}
          onChange={(e) => setNewKrTitle(e.target.value)}
          placeholder="Nuevo resultado clave…"
          className="flex-1 h-8 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && handleAddKr()}
        />
        <Button size="sm" variant="outline" onClick={handleAddKr} className="h-8">
          <Plus size={13} className="mr-1" />Agregar KR
        </Button>
      </div>

      {/* Generar plan con IA */}
      <div className="pt-1">
        {plan.error && <ApiErrorNotice error={plan.error} className="mb-2" />}
        {plan.loading ? (
          <div className="rounded-md border border-brand/20 bg-brand-soft p-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              Generando plan…
            </div>
          </div>
        ) : plan.proposed ? (
          <PlanReview
            proposed={plan.proposed}
            feasibility={plan.feasibility}
            onChangeKr={updateProposedKr}
            onRemoveKr={removeProposedKr}
            onChangeTask={updateProposedTask}
            onRemoveTask={removeProposedTask}
            onAccept={acceptPlan}
            onDiscard={discardPlan}
          />
        ) : smartComplete ? (
          <Button size="sm" variant="outline" onClick={generatePlan} className="border-brand/30 text-brand-soft-foreground hover:bg-brand-soft">
            <Sparkles size={12} className="mr-2" />Generar plan con IA
          </Button>
        ) : (
          <div className="space-y-1.5">
            <Button size="sm" variant="outline" onClick={onRequestDefine} className="border-brand/30 text-brand-soft-foreground hover:bg-brand-soft">
              <Sparkles size={12} className="mr-2" />Definir objetivo
            </Button>
            <p className="text-[11px] text-muted-foreground/70">
              Definí el objetivo en formato SMART (meta, punto de partida, fecha y por qué) para que el plan IA salga aterrizado.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Una fila de Resultado Clave con sus tareas (expandibles) y alta de tarea. */
function KeyResultRow({
  kr,
  tasks,
  allSteps,
  index,
  total,
  expanded,
  editId,
  editTitle,
  onToggleCollapse,
  onMoveKr,
  onRemoveKr,
  onCycleKrStatus,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditTitle,
  onAddTask,
  onMoveTask,
  onRemoveTask,
  onSetTaskStatus,
  onSaveTaskEdit,
}: {
  kr: ObjectiveStep
  tasks: ObjectiveStep[]
  /** Todos los pasos del objetivo: para detectar bloqueos y ofrecer dependencias. */
  allSteps: ObjectiveStep[]
  index: number
  total: number
  expanded: boolean
  editId: string | null
  editTitle: string
  onToggleCollapse: () => void
  onMoveKr: (id: string, dir: 'up' | 'down') => void
  onRemoveKr: (kr: ObjectiveStep) => void
  onCycleKrStatus: (id: string, st: ObjectiveStepStatus) => void
  onStartEdit: (s: ObjectiveStep) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditTitle: (v: string) => void
  onAddTask: (kr: ObjectiveStep, title: string, date: string) => void
  onMoveTask: (kr: ObjectiveStep, id: string, dir: 'up' | 'down') => void
  onRemoveTask: (kr: ObjectiveStep, task: ObjectiveStep) => void
  onSetTaskStatus: (id: string, ts: TaskStatus) => void
  onSaveTaskEdit: (id: string, patch: Partial<ObjectiveStep>) => void
}) {
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDate, setNewTaskDate] = useState('')
  const hasTasks = tasks.length > 0
  const krProgress = computeKeyResultProgress(tasks, kr)
  const krDone = krProgress.percent === 100
  const krEditing = editId === kr.id

  function submitTask() {
    if (!newTaskTitle.trim()) {
      onAddTask(kr, newTaskTitle, newTaskDate) // delega el toast de error
      return
    }
    onAddTask(kr, newTaskTitle, newTaskDate)
    setNewTaskTitle('')
    setNewTaskDate('')
  }

  return (
    <li className="rounded-md border border-border/50 bg-muted/20">
      {/* Cabecera del KR */}
      <div className="flex items-start gap-2 p-2.5">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="mt-0.5 flex-shrink-0 text-text-tertiary hover:text-foreground transition-colors"
          aria-expanded={expanded}
          aria-label={expanded ? 'Colapsar tareas' : 'Expandir tareas'}
        >
          <ChevronRight size={14} className={cn('transition-transform', expanded && 'rotate-90')} />
        </button>

        {/* Indicador de estado del KR: derivado si tiene tareas, ciclable si no */}
        {hasTasks ? (
          <span
            className={cn('mt-0.5 flex-shrink-0', krDone ? 'text-ok' : krProgress.percent > 0 ? 'text-warn' : 'text-text-tertiary')}
            title={`${krProgress.done}/${krProgress.total} tareas`}
          >
            {krDone ? <Check size={16} strokeWidth={2} /> : <CircleDot size={16} strokeWidth={2} />}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onCycleKrStatus(kr.id, nextStatus(kr.status))}
            className={cn('mt-0.5 flex-shrink-0 transition-colors hover:opacity-80', STATUS_META[kr.status].cls)}
            aria-label={`Estado: ${STATUS_META[kr.status].label}. Click para cambiar.`}
            title={STATUS_META[kr.status].label}
          >
            {(() => {
              const I = STATUS_META[kr.status].icon
              return <I size={16} strokeWidth={2} />
            })()}
          </button>
        )}

        {krEditing ? (
          <div className="flex-1 flex flex-col sm:flex-row gap-1.5">
            <Input
              value={editTitle}
              onChange={(e) => onEditTitle(e.target.value)}
              className="flex-1 h-8 text-sm"
              placeholder="Resultado clave"
              onKeyDown={(e) => e.key === 'Enter' && onSaveEdit()}
            />
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={onSaveEdit} className="h-8">Guardar</Button>
              <Button size="sm" variant="ghost" onClick={onCancelEdit} className="h-8">Cancelar</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Target size={12} className="text-brand-soft-foreground flex-shrink-0" aria-hidden="true" />
                <span className={cn('text-sm font-medium', krDone ? 'text-muted-foreground line-through' : 'text-foreground')}>
                  {kr.title}
                </span>
                <span className="text-[10px] font-mono tabular-nums text-text-tertiary">
                  {hasTasks ? `${krProgress.done}/${krProgress.total} · ${krProgress.percent}%` : 'sin tareas'}
                </span>
              </div>
              {hasTasks && (
                <div className="mt-1.5 h-1 bg-secondary rounded-full max-w-[12rem]">
                  <div className="h-1 rounded-full bg-brand transition-all" style={{ width: krProgress.percent + '%' }} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <IconBtn label="Subir KR" disabled={index === 0} onClick={() => onMoveKr(kr.id, 'up')}><ChevronUp size={14} /></IconBtn>
              <IconBtn label="Bajar KR" disabled={index === total - 1} onClick={() => onMoveKr(kr.id, 'down')}><ChevronDown size={14} /></IconBtn>
              <IconBtn label="Editar KR" onClick={() => onStartEdit(kr)}><Pencil size={13} /></IconBtn>
              <IconBtn label="Borrar KR" danger onClick={() => onRemoveKr(kr)}><Trash2 size={13} /></IconBtn>
            </div>
          </>
        )}
      </div>

      {/* Tareas */}
      {expanded && (
        <div className="pl-8 pr-2.5 pb-2.5 space-y-1">
          {tasks.map((t, ti) =>
            editId === t.id ? (
              <TaskEditor
                key={t.id}
                task={t}
                allSteps={allSteps}
                onSave={(patch) => onSaveTaskEdit(t.id, patch)}
                onCancel={onCancelEdit}
              />
            ) : (
              <TaskRow
                key={t.id}
                task={t}
                allSteps={allSteps}
                first={ti === 0}
                last={ti === tasks.length - 1}
                onSetStatus={onSetTaskStatus}
                onStartEdit={() => onStartEdit(t)}
                onMove={(dir) => onMoveTask(kr, t.id, dir)}
                onRemove={() => onRemoveTask(kr, t)}
              />
            ),
          )}

          {/* Alta de tarea */}
          <div className="flex flex-col sm:flex-row gap-1.5 pt-1">
            <Input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Nueva tarea…"
              className="flex-1 h-7 text-[13px]"
              onKeyDown={(e) => e.key === 'Enter' && submitTask()}
            />
            <Input
              type="date"
              value={newTaskDate}
              onChange={(e) => setNewTaskDate(e.target.value)}
              className="h-7 w-full sm:w-36 font-mono text-xs"
              aria-label="Fecha de la tarea (opcional)"
            />
            <Button size="sm" variant="ghost" onClick={submitTask} className="h-7 text-xs">
              <Plus size={12} className="mr-1" />Tarea
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

/** Botón-ícono compacto reutilizable (controles de fila). */
function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'p-1 text-text-tertiary transition-colors disabled:opacity-25',
        danger ? 'hover:text-bad' : 'hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/** Frase relativa breve de una fecha de tarea (para el due date). */
function dueHint(days: number): string {
  if (days < 0) return `vencida hace ${Math.abs(days)}d`
  if (days === 0) return 'vence hoy'
  if (days === 1) return 'vence mañana'
  return `en ${days}d`
}

/** Fila de TAREA en modo lectura: estado (4), criterio, fecha, esfuerzo, prioridad,
 *  bloqueo. Las vencidas/bloqueadas se resaltan con semánticos (urgencia/bloqueo). */
function TaskRow({
  task,
  allSteps,
  first,
  last,
  onSetStatus,
  onStartEdit,
  onMove,
  onRemove,
}: {
  task: ObjectiveStep
  allSteps: ObjectiveStep[]
  first: boolean
  last: boolean
  onSetStatus: (id: string, ts: TaskStatus) => void
  onStartEdit: () => void
  onMove: (dir: 'up' | 'down') => void
  onRemove: () => void
}) {
  const effective = effectiveTaskStatus(task)
  const done = effective === 'done'
  const depsIncomplete = blockedByIncomplete(task, allSteps)
  const blocked = effective === 'blocked' || depsIncomplete.length > 0
  const days = task.targetDate ? daysUntilStep(task, new Date()) : null
  const overdue = days != null && days < 0 && !done

  // Ícono de estado: si está bloqueada (explícito o por dependencia) mostramos
  // el ícono de bloqueo; si no, el del estado efectivo. Click cicla el flujo.
  const display = blocked ? TASK_STATUS_META.blocked : TASK_STATUS_META[effective]
  const DIcon = display.icon

  return (
    <div className="flex items-start gap-2 py-0.5">
      <button
        type="button"
        onClick={() => onSetStatus(task.id, nextTaskStatus(effective))}
        className={cn('mt-0.5 flex-shrink-0 transition-colors hover:opacity-80', display.cls)}
        aria-label={`Estado: ${display.label}. Click para avanzar.`}
        title={blocked ? 'Bloqueada' : display.label}
      >
        <DIcon size={15} strokeWidth={2} />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn('text-[13px]', done ? 'text-muted-foreground line-through' : 'text-foreground')}>
            {task.title}
          </span>
          {task.priority && <PriorityChip priority={task.priority} />}
          {task.effort && <EffortChip effort={task.effort} />}
        </div>

        {task.description && (
          <div className="text-[11px] text-muted-foreground/80 mt-0.5">{task.description}</div>
        )}

        {task.acceptanceCriteria && (
          <div className="mt-0.5 flex items-start gap-1 text-[11px] text-text-tertiary">
            <Check size={11} className="mt-0.5 flex-shrink-0 opacity-70" aria-hidden="true" />
            <span>{task.acceptanceCriteria}</span>
          </div>
        )}

        {(task.targetDate || blocked) && (
          <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[10px] font-mono">
            {task.targetDate && (
              <span
                className={cn(
                  'inline-flex items-center gap-1',
                  overdue ? 'text-bad-foreground' : 'text-muted-foreground/60',
                )}
              >
                <CalendarClock size={10} aria-hidden="true" />
                {task.targetDate}
                {days != null && <span className="opacity-80">· {dueHint(days)}</span>}
              </span>
            )}
            {blocked && (
              <span className="inline-flex items-center gap-1 text-bad-foreground" title="Bloqueada">
                <Lock size={10} aria-hidden="true" />
                {depsIncomplete.length > 0
                  ? `depende de: ${depsIncomplete.map((d) => d.title).join(', ')}`
                  : 'bloqueada'}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 flex-shrink-0">
        <IconBtn label="Subir tarea" disabled={first} onClick={() => onMove('up')}><ChevronUp size={13} /></IconBtn>
        <IconBtn label="Bajar tarea" disabled={last} onClick={() => onMove('down')}><ChevronDown size={13} /></IconBtn>
        <IconBtn label="Editar tarea" onClick={onStartEdit}><Pencil size={12} /></IconBtn>
        <IconBtn label="Borrar tarea" danger onClick={onRemove}><Trash2 size={12} /></IconBtn>
      </div>
    </div>
  )
}

/**
 * Editor inline de una tarea (Jira-light): título, criterio de aceptación, fecha,
 * esfuerzo, prioridad, estado de workflow (4) y dependencias. Estado local propio
 * (no se sube al padre): al guardar emite un patch único. Las dependencias que
 * crearían un ciclo se ofrecen deshabilitadas.
 */
function TaskEditor({
  task,
  allSteps,
  onSave,
  onCancel,
}: {
  task: ObjectiveStep
  allSteps: ObjectiveStep[]
  onSave: (patch: Partial<ObjectiveStep>) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [date, setDate] = useState(task.targetDate ?? '')
  const [acceptance, setAcceptance] = useState(task.acceptanceCriteria ?? '')
  const [effort, setEffort] = useState<TaskEffort | undefined>(task.effort)
  const [priority, setPriority] = useState<TaskPriority | undefined>(task.priority)
  const [status, setStatus] = useState<TaskStatus>(effectiveTaskStatus(task))
  const [deps, setDeps] = useState<string[]>(task.blockedBy ?? [])

  // Candidatas a dependencia: otras tareas del MISMO objetivo (self-ref). Las que
  // cerrarían un ciclo se muestran deshabilitadas (no se pueden tildar).
  const candidates = allSteps.filter(
    (s) => isTask(s) && s.objectiveId === task.objectiveId && s.id !== task.id,
  )

  function toggleDep(id: string) {
    setDeps((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]))
  }

  function save() {
    const t = title.trim()
    if (!t) {
      toast.error('Título requerido', { description: 'La tarea no puede quedar vacía.' })
      return
    }
    onSave({
      title: t,
      targetDate: date || undefined,
      acceptanceCriteria: acceptance.trim() || undefined,
      effort,
      priority,
      blockedBy: deps.length > 0 ? deps : undefined,
      ...taskStatusPatch(status),
    })
  }

  return (
    <div className="rounded-md border border-brand/30 bg-muted/30 p-2.5 space-y-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-8 text-sm"
        placeholder="Tarea"
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />

      <div>
        <label className="text-[10px] uppercase tracking-[0.07em] text-text-tertiary">
          Criterio de aceptación (definición de hecho)
        </label>
        <Textarea
          value={acceptance}
          onChange={(e) => setAcceptance(e.target.value)}
          placeholder="¿Cómo sabés que quedó terminada? Ej.: visa aprobada y en pasaporte."
          className="mt-0.5 min-h-[44px] text-[13px]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.07em] text-text-tertiary">
          Fecha
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-7 w-36 font-mono text-xs normal-case tracking-normal"
            aria-label="Fecha objetivo de la tarea"
          />
        </label>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.07em] text-text-tertiary">
          Esfuerzo
          <EffortControl value={effort} onChange={setEffort} />
        </div>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.07em] text-text-tertiary">
          Prioridad
          <PriorityControl value={priority} onChange={setPriority} />
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.07em] text-text-tertiary">
        Estado
        <StatusControl value={status} onChange={setStatus} />
      </div>

      {candidates.length > 0 && (
        <div>
          <span className="text-[10px] uppercase tracking-[0.07em] text-text-tertiary">
            Depende de
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {candidates.map((c) => {
              const selected = deps.includes(c.id)
              const cyclic = !selected && wouldCreateDependencyCycle(allSteps, task.id, c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={cyclic}
                  onClick={() => toggleDep(c.id)}
                  title={cyclic ? 'Crearía una dependencia circular' : c.title}
                  className={cn(
                    'max-w-[14rem] truncate rounded border px-1.5 py-0.5 text-[11px] transition-colors',
                    selected
                      ? 'border-brand/40 bg-brand-soft text-brand-soft-foreground'
                      : 'border-border/60 text-text-tertiary hover:text-foreground hover:bg-muted/40',
                    cyclic && 'opacity-30 cursor-not-allowed hover:bg-transparent',
                  )}
                >
                  {c.title}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-1 pt-0.5">
        <Button size="sm" variant="outline" onClick={save} className="h-8">Guardar</Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-8">Cancelar</Button>
      </div>
    </div>
  )
}

/** Review-before-save del plan OKR generado: KRs con tareas, editable. */
function PlanReview({
  proposed,
  feasibility,
  onChangeKr,
  onRemoveKr,
  onChangeTask,
  onRemoveTask,
  onAccept,
  onDiscard,
}: {
  proposed: ProposedKeyResult[]
  feasibility: string[]
  onChangeKr: (i: number, patch: Partial<Omit<ProposedKeyResult, 'tasks'>>) => void
  onRemoveKr: (i: number) => void
  onChangeTask: (i: number, j: number, patch: Partial<ProposedTask>) => void
  onRemoveTask: (i: number, j: number) => void
  onAccept: () => void
  onDiscard: () => void
}) {
  const krCount = proposed.filter((kr) => kr.title.trim()).length
  const taskCount = proposed.reduce((n, kr) => n + kr.tasks.filter((t) => t.title.trim()).length, 0)

  return (
    <div className="rounded-md border border-brand/30 bg-brand-soft p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-brand-soft-foreground">
          <Sparkles size={13} />
          Plan OKR propuesto · revisá, editá y aceptá (o descartá)
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
        <p className="text-xs text-muted-foreground">Sin resultados clave para guardar.</p>
      ) : (
        <ul className="space-y-2.5">
          {proposed.map((kr, i) => (
            <li key={i} className="rounded-md border border-border/50 bg-background/40 p-2 space-y-1.5">
              {/* KR */}
              <div className="flex items-start gap-1.5">
                <Target size={12} className="mt-2.5 text-brand-soft-foreground flex-shrink-0" aria-hidden="true" />
                <Input
                  value={kr.title}
                  onChange={(e) => onChangeKr(i, { title: e.target.value })}
                  className="h-8 text-sm font-medium flex-1"
                  placeholder="Resultado clave"
                />
                <button
                  type="button"
                  onClick={() => onRemoveKr(i)}
                  className="p-1.5 text-muted-foreground/50 hover:text-bad flex-shrink-0"
                  aria-label={`Quitar resultado clave ${i + 1}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Tareas del KR */}
              {kr.tasks.length > 0 && (
                <ul className="pl-5 space-y-1">
                  {kr.tasks.map((t, j) => (
                    <li key={j} className="space-y-1 border-l border-border/40 pl-2">
                      <div className="flex gap-1.5 items-start">
                        <span className="text-[10px] font-mono text-muted-foreground/50 mt-2 w-4 flex-shrink-0">{j + 1}.</span>
                        <Input
                          value={t.title}
                          onChange={(e) => onChangeTask(i, j, { title: e.target.value })}
                          className="h-7 text-[13px] flex-1"
                          placeholder="Tarea concreta"
                        />
                        <button
                          type="button"
                          onClick={() => onRemoveTask(i, j)}
                          className="p-1 text-muted-foreground/50 hover:text-bad flex-shrink-0"
                          aria-label={`Quitar tarea ${i + 1}.${j + 1}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <Input
                        value={t.acceptanceCriteria ?? ''}
                        onChange={(e) => onChangeTask(i, j, { acceptanceCriteria: e.target.value || undefined })}
                        className="h-7 text-[12px] ml-5"
                        placeholder="Criterio de aceptación (definición de hecho)"
                        aria-label={`Criterio de aceptación tarea ${i + 1}.${j + 1}`}
                      />
                      <div className="ml-5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <Input
                          type="date"
                          value={t.targetDate ?? ''}
                          onChange={(e) => onChangeTask(i, j, { targetDate: e.target.value || undefined })}
                          className="h-7 w-36 font-mono text-xs"
                          aria-label={`Fecha tarea ${i + 1}.${j + 1}`}
                        />
                        <EffortControl
                          value={t.effort}
                          onChange={(v) => onChangeTask(i, j, { effort: v })}
                        />
                        <PriorityControl
                          value={t.priority}
                          onChange={(v) => onChangeTask(i, j, { priority: v })}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Notas de viabilidad aterrizadas en la data real (no se persisten). */}
      {feasibility.length > 0 && (
        <div className="rounded-md border border-warn/30 bg-warn-soft p-2.5 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.07em] text-warn-foreground">
            <Gauge size={12} aria-hidden="true" />
            Viabilidad (según tu data real)
          </div>
          <ul className="space-y-1">
            {feasibility.map((note, i) => (
              <li key={i} className="text-[12px] text-foreground/90 leading-snug flex gap-1.5">
                <span className="text-warn-foreground/70 flex-shrink-0">·</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={onAccept}
          className="border-ok/30 bg-ok-soft text-ok-foreground hover:bg-ok/20 hover:text-ok-foreground"
        >
          Aceptar plan ({krCount} KR · {taskCount} tareas)
        </Button>
        <Button size="sm" variant="ghost" onClick={onDiscard}>Descartar</Button>
      </div>
    </div>
  )
}
