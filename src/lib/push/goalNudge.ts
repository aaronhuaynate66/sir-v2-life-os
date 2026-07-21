// SIR V2 — Nudge de OBJETIVOS para el push de la mañana (PURO, testeable).
//
// La app COMPUTA cuándo un objetivo necesita atención (norteDrift='estancado',
// goal engine detectGoalsAtRisk) pero lo deja en paneles pasivos de /yo y
// /objetivos — SIR sabe pero no avisa. Esto lo saca al push: una línea corta que
// EMPUJA, para que la proactividad diaria no sea 100% relacional/salud.
//
// Conservador: solo surge si hay señal real (norte parado o meta en riesgo).

export interface GoalForNudge {
  title: string
  isAnchor: boolean
  /** 0-100. */
  progress: number
  /** YYYY-MM-DD o null. */
  targetDate: string | null
  /** ISO de la última vez que se tocó el objetivo (o un paso suyo). */
  updatedAt: string
}

/** Días sin tocar el norte para considerarlo "parado" en el push. Más ajustado
 *  que el umbral de norteDrift (panel) porque el push es un empujón diario. */
const ANCHOR_STALL_DAYS = 14
const RISK_WINDOW_DAYS = 30
const RISK_PROGRESS = 50

function daysSince(iso: string, now: Date): number {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 0
  return Math.floor((now.getTime() - t) / 86_400_000)
}

function daysUntil(date: string, now: Date): number {
  const t = Date.parse(date + 'T00:00:00Z')
  const n = Date.parse(now.toISOString().slice(0, 10) + 'T00:00:00Z')
  if (!Number.isFinite(t) || !Number.isFinite(n)) return NaN
  return Math.round((t - n) / 86_400_000)
}

/**
 * Una línea corta para el push, o null. Prioridad: NORTE estancado primero
 * (es lo que más pesa), luego el objetivo en RIESGO más urgente (vence pronto y
 * va atrás). PURO — `now` inyectable.
 */
export function goalNudgeLine(goals: GoalForNudge[], now: Date = new Date()): string | null {
  // 1. Norte estancado: no se toca hace ≥ANCHOR_STALL_DAYS.
  const anchor = goals.find((g) => g.isAnchor)
  if (anchor) {
    const d = daysSince(anchor.updatedAt, now)
    if (d >= ANCHOR_STALL_DAYS) {
      return `Tu norte ("${anchor.title}") lleva ${d} días sin moverse — dale un paso hoy`
    }
  }

  // 2. Objetivo en riesgo: vence dentro de la ventana y va por debajo del umbral.
  //    El más urgente (menos días para vencer) gana.
  const atRisk = goals
    .filter((g) => g.targetDate)
    .map((g) => ({ g, du: daysUntil(g.targetDate as string, now) }))
    .filter(({ g, du }) => Number.isFinite(du) && du >= 0 && du < RISK_WINDOW_DAYS && g.progress < RISK_PROGRESS)
    .sort((a, b) => a.du - b.du)[0]
  if (atRisk) {
    const { g, du } = atRisk
    const when = du === 0 ? 'vence hoy' : du === 1 ? 'vence mañana' : `vence en ${du} días`
    return `"${g.title}" ${when} y vas ${g.progress}% — conviene un empujón`
  }

  return null
}
