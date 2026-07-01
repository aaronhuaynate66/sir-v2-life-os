// SIR V2 — Metadata visual de objetivos (labels + clases por categoria/prioridad/estado).
//
// Constantes que se usan en /objetivos y (potencialmente) /objetivos/[id] para
// renderizar badges y headings. Antes vivian inline en page.tsx (867 lineas) —
// se sacan para que:
//   - la card se pueda extraer sin arrastrar 30 lineas de constantes atras,
//   - futuros retoques (nuevo color de prioridad, nueva categoria) tengan un
//     solo lugar donde vivir,
//   - /objetivos/[id] pueda reusar el mismo lenguaje visual sin duplicar.
//
// Todo pure: cero side-effects, cero JSX, cero dependencias — solo tipos.

import type { Goal, GoalCategory, GoalPriority } from '@/types'

/** Label humano por categoria de goal. */
export const CAT_LABEL: Record<GoalCategory, string> = {
  financial: 'Financiero',
  personal: 'Personal',
  relational: 'Relacional',
  health: 'Salud',
  career: 'Carrera',
  spiritual: 'Espiritual',
  creative: 'Creativo',
}

/** Label humano por prioridad. */
export const PRIO_LABEL: Record<GoalPriority, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo',
}

/** Clases Tailwind por prioridad (borde + fondo + texto). */
export const PRIO_CLASS: Record<GoalPriority, string> = {
  critical: 'border-bad/30 bg-bad-soft text-bad-foreground',
  high: 'border-warn/30 bg-warn-soft text-warn-foreground',
  medium: 'border-brand/30 bg-brand-soft text-brand-soft-foreground',
  low: 'border-border bg-muted text-muted-foreground',
}

/** Color de texto por estado del goal. */
export const STATUS_COLORS: Record<Goal['status'], string> = {
  active: 'text-ok',
  paused: 'text-warn',
  completed: 'text-brand-soft-foreground',
  abandoned: 'text-muted-foreground/50',
}

/** Label humano por estado. */
export const STATUS_LABEL: Record<Goal['status'], string> = {
  active: 'activo',
  paused: 'pausado',
  completed: 'completado',
  abandoned: 'abandonado',
}

/** Clase de hover para las cards de goal (usada por el listado y por futuros
 *  componentes que reusen el look). */
export const GOAL_CARD_CLASS = 'transition-colors duration-200 hover:border-border-strong'
