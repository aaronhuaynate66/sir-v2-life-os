// SIR V2 — /horario · plan del día (fusión calendario + tareas + huecos), puro.
//
// La vista Día ya no es un espejo del calendario: este builder FUSIONA en un
// solo eje temporal los eventos del calendario (DayTimeline) con las TAREAS OKR
// que vencen HOY y tienen una hora asignada, y entre los bloques ocupados
// calcula los HUECOS LIBRES de la ventana activa.
//
// Reglas (acordadas con el pedido):
//   - Una tarea entra a la línea del día sólo si vence HOY (daysUntil === 0) y
//     trae hora (`dueTime`). Las tareas de hoy SIN hora y las VENCIDAS NO se
//     inventan una franja: quedan en `untimedTasks` → sección "Vencen hoy".
//   - Los huecos son INTERIORES (entre dos bloques ocupados), nunca un hueco
//     líder antes del primer bloque ni uno abierto después del último → así no
//     marcamos "libre" la madrugada ni la noche.
//   - Sólo cuentan huecos dentro de la ventana activa (07:00–22:00 Lima) y de
//     duración relevante (≥ 30 min). Los huecos ya pasados se descartan (ruido).
//
// Determinístico: `nowMs` se inyecta. TZ Lima (UTC-5 fijo) vía tz.ts, igual que
// el resto del calendario.

import { LIMA_UTC_OFFSET_HOURS } from '@/lib/calendar/tz'
import type { BlockStatus, DayTimeline, TimelineBlock } from '@/lib/calendar/timeline'
import type { CockpitTask } from './cockpit'

const MIN = 60_000

/** Ventana activa del día (reloj Lima): fuera de acá no marcamos huecos libres. */
export const ACTIVE_START_HOUR = 7
export const ACTIVE_END_HOUR = 22
/** Hueco mínimo relevante para mostrar. */
export const MIN_GAP_MINUTES = 30
/** Duración default de una tarea con hora (es un punto, no una reunión). */
export const DEFAULT_TASK_MINUTES = 30

// ─── Filas del plan ────────────────────────────────────────────────────

export interface EventRow {
  type: 'event'
  key: string
  block: TimelineBlock
}

export interface TaskRowItem {
  type: 'task'
  key: string
  task: CockpitTask
  startMs: number
  endMs: number
  status: BlockStatus
}

export interface GapRowItem {
  type: 'gap'
  key: string
  startMs: number
  endMs: number
  minutes: number
  status: BlockStatus
}

export type DayPlanRow = EventRow | TaskRowItem | GapRowItem

export interface DayPlan {
  /** Filas ordenadas por inicio: eventos del calendario, tareas con hora y huecos libres. */
  rows: DayPlanRow[]
  /** Tareas de hoy SIN hora (+ vencidas) → van a la sección "Vencen hoy". */
  untimedTasks: CockpitTask[]
}

export interface DayPlanOptions {
  activeStartHour?: number
  activeEndHour?: number
  minGapMinutes?: number
  defaultTaskMinutes?: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** ms de un reloj de pared Lima ('YYYY-MM-DD' + hora/min). Lima es UTC-5 fijo. */
function limaWallToMs(dateKey: string, hour: number, minute: number): number {
  const [y, mo, d] = dateKey.split('-').map(Number)
  return Date.UTC(y, mo - 1, d, hour + LIMA_UTC_OFFSET_HOURS, minute, 0, 0)
}

function statusOf(startMs: number, endMs: number, nowMs: number): BlockStatus {
  if (nowMs >= endMs) return 'past'
  if (nowMs >= startMs) return 'current'
  return 'upcoming'
}

/** Rango de orden para desempatar filas con el mismo inicio (evento < tarea < hueco). */
const ROW_RANK: Record<DayPlanRow['type'], number> = { event: 0, task: 1, gap: 2 }

interface Interval {
  startMs: number
  endMs: number
}

/**
 * Huecos LIBRES interiores entre intervalos ocupados (ya sea de eventos o
 * tareas), recortados a la ventana activa y filtrados por duración mínima. No
 * emite hueco antes del primer bloque ni después del último (no inventa
 * madrugada/noche libre). Tolera solapamientos (los une por barrido).
 */
function computeFreeGaps(
  occupied: Interval[],
  activeStartMs: number,
  activeEndMs: number,
  minGapMs: number,
  nowMs: number,
): GapRowItem[] {
  const sorted = [...occupied].sort((a, b) => a.startMs - b.startMs)
  const gaps: GapRowItem[] = []
  let cursor: number | null = null
  for (const iv of sorted) {
    if (cursor === null) {
      cursor = iv.endMs
      continue
    }
    if (iv.startMs > cursor) {
      const gStart = Math.max(cursor, activeStartMs)
      const gEnd = Math.min(iv.startMs, activeEndMs)
      // Hueco relevante (≥ mínimo) y no totalmente pasado.
      if (gEnd - gStart >= minGapMs && gEnd > nowMs) {
        gaps.push({
          type: 'gap',
          key: `gap_${gStart}`,
          startMs: gStart,
          endMs: gEnd,
          minutes: Math.round((gEnd - gStart) / MIN),
          status: statusOf(gStart, gEnd, nowMs),
        })
      }
    }
    cursor = Math.max(cursor, iv.endMs)
  }
  return gaps
}

// ─── Builder ─────────────────────────────────────────────────────────────

/**
 * Arma el plan del día: fusiona los bloques del calendario con las tareas OKR
 * que vencen hoy con hora, calcula los huecos libres y separa las tareas sin
 * hora (para "Vencen hoy"). El orden de `untimedTasks` se conserva (ya viene
 * priorizado por el cockpit).
 */
export function buildDayPlan(
  timeline: DayTimeline,
  tasksToday: CockpitTask[],
  nowMs: number,
  opts: DayPlanOptions = {},
): DayPlan {
  const {
    activeStartHour = ACTIVE_START_HOUR,
    activeEndHour = ACTIVE_END_HOUR,
    minGapMinutes = MIN_GAP_MINUTES,
    defaultTaskMinutes = DEFAULT_TASK_MINUTES,
  } = opts

  // Tareas: con hora HOY → a la línea del día; el resto (sin hora o vencidas) → "Vencen hoy".
  const taskRows: TaskRowItem[] = []
  const untimedTasks: CockpitTask[] = []
  for (const t of tasksToday) {
    const hhmm = t.daysUntil === 0 ? t.dueTime : undefined
    if (!hhmm) {
      untimedTasks.push(t)
      continue
    }
    const [hh, mm] = hhmm.split(':').map(Number)
    const startMs = limaWallToMs(timeline.dateKey, hh, mm)
    const endMs = startMs + defaultTaskMinutes * MIN
    taskRows.push({
      type: 'task',
      key: t.id,
      task: t,
      startMs,
      endMs,
      status: statusOf(startMs, endMs, nowMs),
    })
  }

  const eventRows: EventRow[] = timeline.blocks.map((block) => ({
    type: 'event',
    key: block.event.id,
    block,
  }))

  const occupied: Interval[] = [
    ...timeline.blocks.map((b) => ({ startMs: b.startMs, endMs: b.endMs })),
    ...taskRows.map((r) => ({ startMs: r.startMs, endMs: r.endMs })),
  ]

  const activeStartMs = limaWallToMs(timeline.dateKey, activeStartHour, 0)
  const activeEndMs = limaWallToMs(timeline.dateKey, activeEndHour, 0)
  const gapRows = computeFreeGaps(occupied, activeStartMs, activeEndMs, minGapMinutes * MIN, nowMs)

  const startOf = (r: DayPlanRow): number => (r.type === 'event' ? r.block.startMs : r.startMs)
  const rows: DayPlanRow[] = [...eventRows, ...taskRows, ...gapRows].sort(
    (a, b) => startOf(a) - startOf(b) || ROW_RANK[a.type] - ROW_RANK[b.type] || a.key.localeCompare(b.key),
  )

  return { rows, untimedTasks }
}
