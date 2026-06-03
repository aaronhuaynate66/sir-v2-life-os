'use client'
// SIR V2 — Controles presentacionales de los campos "Jira-light" de una tarea
// (migración 0050). Compartidos entre el editor inline de /objetivos y el
// review-before-save del plan IA, para no duplicar el look ni el mapeo de estado.
//
// Disciplina de acento (rediseño oscuro): el violeta brand es el acento de
// selección neutra (effort/priority). Los semánticos (ok/warn/bad) se reservan
// para URGENCIA/BLOQUEO → los usa SOLO el estado de workflow (done=ok,
// en progreso=warn, bloqueada=bad) y el resaltado de vencidas/bloqueos.

import { Circle, CircleDot, Check, Ban } from 'lucide-react'
import type { TaskStatus, TaskEffort, TaskPriority } from '@/types'
import { cn } from '@/lib/utils'

// ─── Estado de workflow (4 valores) ────────────────────────────────────

export const TASK_STATUS_META: Record<
  TaskStatus,
  { icon: typeof Circle; cls: string; label: string; selCls: string }
> = {
  todo: {
    icon: Circle,
    cls: 'text-text-tertiary',
    label: 'Por hacer',
    selCls: 'bg-secondary text-foreground border-border',
  },
  in_progress: {
    icon: CircleDot,
    cls: 'text-warn',
    label: 'En progreso',
    selCls: 'bg-warn-soft text-warn-foreground border-warn/40',
  },
  blocked: {
    icon: Ban,
    cls: 'text-bad',
    label: 'Bloqueada',
    selCls: 'bg-bad-soft text-bad-foreground border-bad/40',
  },
  done: {
    icon: Check,
    cls: 'text-ok',
    label: 'Hecha',
    selCls: 'bg-ok-soft text-ok-foreground border-ok/40',
  },
}

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done']

/**
 * Cicla hacia adelante el flujo común: todo → en progreso → hecha → todo.
 * Saltea 'blocked' (no es un paso natural del avance; se setea explícito en el
 * editor o se deriva de una dependencia incompleta).
 */
export function nextTaskStatus(ts: TaskStatus): TaskStatus {
  if (ts === 'todo') return 'in_progress'
  if (ts === 'in_progress') return 'done'
  if (ts === 'blocked') return 'in_progress'
  return 'todo' // done → todo
}

/** Selector segmentado de los 4 estados (cada uno con su color semántico). */
export function StatusControl({
  value,
  onChange,
  size = 'sm',
}: {
  value: TaskStatus
  onChange: (v: TaskStatus) => void
  size?: 'sm' | 'xs'
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Estado de la tarea"
      className="inline-flex rounded-md border border-border/60 overflow-hidden"
    >
      {STATUS_ORDER.map((s) => {
        const meta = TASK_STATUS_META[s]
        const Icon = meta.icon
        const active = value === s
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={meta.label}
            title={meta.label}
            onClick={() => onChange(s)}
            className={cn(
              'flex items-center gap-1 border-r border-border/60 last:border-r-0 transition-colors',
              size === 'xs' ? 'px-1.5 py-1 text-[10px]' : 'px-2 py-1 text-[11px]',
              active ? meta.selCls : 'text-text-tertiary hover:text-foreground hover:bg-muted/40',
            )}
          >
            <Icon size={size === 'xs' ? 11 : 12} strokeWidth={2} />
            <span className="hidden sm:inline">{meta.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Esfuerzo (S/M/L) y prioridad (low/med/high) — acento neutro brand ──

const EFFORT_ORDER: TaskEffort[] = ['S', 'M', 'L']
const EFFORT_LABEL: Record<TaskEffort, string> = { S: 'S', M: 'M', L: 'L' }
const EFFORT_TITLE: Record<TaskEffort, string> = {
  S: 'Esfuerzo chico (rápido)',
  M: 'Esfuerzo medio',
  L: 'Esfuerzo grande',
}

const PRIORITY_ORDER: TaskPriority[] = ['low', 'med', 'high']
const PRIORITY_LABEL: Record<TaskPriority, string> = { low: 'Baja', med: 'Media', high: 'Alta' }

/** Selector segmentado genérico con opción de "limpiar" (volver a undefined). */
function SegmentSelect<T extends string>({
  options,
  labels,
  titles,
  value,
  onChange,
  ariaLabel,
}: {
  options: T[]
  labels: Record<T, string>
  titles?: Record<T, string>
  value: T | undefined
  onChange: (v: T | undefined) => void
  ariaLabel: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-md border border-border/60 overflow-hidden"
    >
      {options.map((o) => {
        const active = value === o
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={active}
            title={titles?.[o] ?? labels[o]}
            // Click en el activo lo limpia (campo opcional → se puede dejar vacío).
            onClick={() => onChange(active ? undefined : o)}
            className={cn(
              'px-2 py-1 text-[11px] border-r border-border/60 last:border-r-0 transition-colors',
              active
                ? 'bg-brand-soft text-brand-soft-foreground border-brand/40'
                : 'text-text-tertiary hover:text-foreground hover:bg-muted/40',
            )}
          >
            {labels[o]}
          </button>
        )
      })}
    </div>
  )
}

export function EffortControl({
  value,
  onChange,
}: {
  value: TaskEffort | undefined
  onChange: (v: TaskEffort | undefined) => void
}) {
  return (
    <SegmentSelect
      options={EFFORT_ORDER}
      labels={EFFORT_LABEL}
      titles={EFFORT_TITLE}
      value={value}
      onChange={onChange}
      ariaLabel="Esfuerzo"
    />
  )
}

export function PriorityControl({
  value,
  onChange,
}: {
  value: TaskPriority | undefined
  onChange: (v: TaskPriority | undefined) => void
}) {
  return (
    <SegmentSelect
      options={PRIORITY_ORDER}
      labels={PRIORITY_LABEL}
      value={value}
      onChange={onChange}
      ariaLabel="Prioridad"
    />
  )
}

// ─── Chips de lectura (read-mode) — monocromos, sin semántico ───────────

/** Chip neutro pequeño (esfuerzo/prioridad en modo lectura). */
export function MetaChip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center rounded border border-border/60 px-1 text-[10px] uppercase tracking-[0.06em] text-text-tertiary"
    >
      {children}
    </span>
  )
}

export function EffortChip({ effort }: { effort: TaskEffort }) {
  return <MetaChip title={EFFORT_TITLE[effort]}>{EFFORT_LABEL[effort]}</MetaChip>
}

export function PriorityChip({ priority }: { priority: TaskPriority }) {
  // 'high' lleva un punto para destacarse SIN romper la disciplina de acento.
  return (
    <MetaChip title={`Prioridad ${PRIORITY_LABEL[priority].toLowerCase()}`}>
      {priority === 'high' && <span className="mr-0.5 text-brand-soft-foreground">●</span>}
      {PRIORITY_LABEL[priority]}
    </MetaChip>
  )
}
