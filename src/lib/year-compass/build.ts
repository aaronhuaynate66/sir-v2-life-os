// SIR V2 — "TU AÑO": brújula anual (lógica pura, testeable).
//
// Toma los OBJETIVOS (Goals) activos con fecha objetivo dentro del año
// calendario actual y los proyecta sobre una línea ENE…DIC, más un ANCLA
// (el norte del año) elegida por el usuario o, en su defecto, inferida.
//
// SOLO objetivos — NO tareas ni KRs (objective_steps). Forward-looking: la
// brújula mira hacia adelante, así que hitos/puntos consideran hoy y futuro
// (daysUntil >= 0). Lo vencido se acciona en /agenda.
//
// Toda fecha date-only se parsea con parseLocalDate (TZ Lima, sin off-by-one).
// "Hoy" se inyecta (now) para que el cómputo sea determinístico y testeable.

import { parseLocalDate } from '@/lib/dates/parseLocalDate'
import type { Goal, GoalPriority } from '@/types'

/** Etiquetas de mes ES, 3 letras mayúsculas, índice 0-11. */
export const MONTH_LABELS_ES = [
  'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
  'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC',
] as const

const PRIORITY_RANK: Record<GoalPriority, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
}

const MS_PER_DAY = 86_400_000

/** Diferencia en días enteros entre dos fechas, comparadas a medianoche local. */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((b - a) / MS_PER_DAY)
}

export interface YearMonth {
  /** 0-11. */
  index: number
  /** ENE…DIC. */
  label: string
  isPast: boolean
  isCurrent: boolean
  isFuture: boolean
  /** Tiene al menos un hito (objetivo con fecha hoy/futuro este año). */
  hasMilestone: boolean
  /** Es el mes del ancla — se resalta con anillo. */
  isAnchorMonth: boolean
}

export interface YearMilestone {
  id: string
  title: string
  /** 0-11. */
  monthIndex: number
  monthLabel: string
  /** Días hasta la fecha objetivo (>= 0, hoy o futuro). */
  daysUntil: number
}

export interface YearAnchor {
  id: string
  title: string
  /** Detalle (ciudad/disciplina…): subtítulo manual, o derivado del objetivo. */
  subtitle: string | null
  /** null si el ancla no tiene fecha objetivo en el año. */
  monthIndex: number | null
  monthLabel: string | null
  /** null si no hay fecha; puede ser negativo si el ancla ya pasó. */
  daysUntil: number | null
}

export interface YearCompass {
  year: number
  /** 0-11. */
  currentMonthIndex: number
  months: YearMonth[]
  /** Próximos hitos del año (excluye el ancla), ordenados por cercanía. Máx 3. */
  upcoming: YearMilestone[]
  /** El norte del año, o null si no hay objetivo elegible. */
  anchor: YearAnchor | null
}

/** Subtítulo del ancla: manual primero, luego target SMART, luego descripción. */
function deriveAnchorSubtitle(goal: Goal): string | null {
  const manual = goal.anchorSubtitle?.trim()
  if (manual) return manual
  const target = goal.target?.trim()
  if (target) return target
  const desc = goal.description?.trim()
  if (desc) return desc
  return null
}

/**
 * Construye la brújula anual desde los objetivos.
 *
 * @param goals  todos los objetivos (se filtran activos internamente)
 * @param now    "hoy" (inyectado para determinismo)
 */
export function buildYearCompass(goals: Goal[], now: Date): YearCompass {
  const year = now.getFullYear()
  const currentMonthIndex = now.getMonth()

  const active = goals.filter((g) => g.status === 'active')

  // Hitos del año: objetivos activos con fecha objetivo en el año actual y
  // hoy/futuro (daysUntil >= 0). Forward-looking.
  const milestones: YearMilestone[] = []
  for (const g of active) {
    const date = parseLocalDate(g.targetDate)
    if (!date || date.getFullYear() !== year) continue
    const daysUntil = daysBetween(now, date)
    if (daysUntil < 0) continue
    milestones.push({
      id: g.id,
      title: g.title,
      monthIndex: date.getMonth(),
      monthLabel: MONTH_LABELS_ES[date.getMonth()],
      daysUntil,
    })
  }
  milestones.sort((a, b) => a.daysUntil - b.daysUntil)

  // ─── Ancla ─────────────────────────────────────────────────────────
  // 1) Explícita: objetivo activo marcado is_anchor (el más reciente si hay
  //    más de uno — no debería, setear uno desmarca el resto).
  // 2) Fallback: objetivo activo con fecha en el año (hoy/futuro), de mayor
  //    prioridad y fecha más lejana.
  let anchorGoal: Goal | null =
    active
      .filter((g) => g.isAnchor)
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0] ?? null

  if (!anchorGoal) {
    const candidates = active.filter((g) => {
      const d = parseLocalDate(g.targetDate)
      return d != null && d.getFullYear() === year && daysBetween(now, d) >= 0
    })
    candidates.sort((a, b) => {
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (pr !== 0) return pr
      // Misma prioridad → fecha más lejana primero.
      const da = parseLocalDate(a.targetDate)!.getTime()
      const db = parseLocalDate(b.targetDate)!.getTime()
      return db - da
    })
    anchorGoal = candidates[0] ?? null
  }

  let anchor: YearAnchor | null = null
  if (anchorGoal) {
    const date = parseLocalDate(anchorGoal.targetDate)
    const inYear = date != null && date.getFullYear() === year
    anchor = {
      id: anchorGoal.id,
      title: anchorGoal.title,
      subtitle: deriveAnchorSubtitle(anchorGoal),
      monthIndex: inYear ? date!.getMonth() : null,
      monthLabel: inYear ? MONTH_LABELS_ES[date!.getMonth()] : null,
      daysUntil: date ? daysBetween(now, date) : null,
    }
  }

  const anchorId = anchor?.id ?? null

  // Próximos: hitos del año sin el ancla, máx 3.
  const upcoming = milestones.filter((m) => m.id !== anchorId).slice(0, 3)

  // Meses con hito: cualquier hito del año (incluido el ancla).
  const milestoneMonths = new Set(milestones.map((m) => m.monthIndex))
  if (anchor?.monthIndex != null) milestoneMonths.add(anchor.monthIndex)

  const months: YearMonth[] = MONTH_LABELS_ES.map((label, index) => ({
    index,
    label,
    isPast: index < currentMonthIndex,
    isCurrent: index === currentMonthIndex,
    isFuture: index > currentMonthIndex,
    hasMilestone: milestoneMonths.has(index),
    isAnchorMonth: anchor?.monthIndex === index,
  }))

  return { year, currentMonthIndex, months, upcoming, anchor }
}
