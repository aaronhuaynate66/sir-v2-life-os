// SIR V2 — Momentum del norte (E5, capa "eficacia + cadencia").
// La deriva (norteDrift) mide ATENCIÓN: ¿le diste tiempo al norte? Esto mide:
//   - EFICACIA: ¿avanzaste de VERDAD el norte? (pasos OKR completados, no solo
//     editar el objetivo) en los últimos 30 días.
//   - CADENCIA: ¿este mes avanzaste más o menos que el anterior? (pasos hechos
//     este mes calendario vs el previo, total y del norte).
// Determinístico, sin IA. Atribuye cada paso a su objetivo vía objectiveId y
// usa completedAt (fecha real de completado, migración 0070).

import type { Goal, ObjectiveStep } from '@/types'

export type NorteEfficacy = 'sin_norte' | 'avanzando' | 'sin_avances'
export type NorteCadence = 'mejor' | 'igual' | 'peor' | 'sin_datos'

export interface NorteMomentum {
  norteTitle: string | null
  norteProgress: number | null
  /** Pasos del norte completados en los últimos 30 días (eficacia reciente). */
  norteStepsDone30d: number
  /** Pasos completados (todos los objetivos) este mes calendario vs el anterior. */
  monthDone: number
  prevMonthDone: number
  /** Pasos del NORTE completados este mes. */
  norteMonthDone: number
  efficacy: NorteEfficacy
  cadence: NorteCadence
  message: string
}

const DAY = 86_400_000
function parse(iso: string | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}
/** Clave 'YYYY-MM' (UTC) de un timestamp. */
function ym(t: number): string {
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function computeNorteMomentum(
  goals: Goal[],
  steps: ObjectiveStep[],
  now: Date = new Date(),
): NorteMomentum {
  const anchor = goals.find((g) => g.status === 'active' && g.isAnchor)
  const nowMs = now.getTime()
  const thisYm = ym(nowMs)
  // Mes anterior (primer día del mes actual menos 1 día → su YYYY-MM).
  const firstOfMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  const prevYm = ym(firstOfMonth - DAY)

  const done = steps.filter((s) => s.status === 'hecho')
  let monthDone = 0
  let prevMonthDone = 0
  let norteMonthDone = 0
  let norteStepsDone30d = 0
  for (const s of done) {
    const t = parse(s.completedAt)
    if (t === null) continue
    const k = ym(t)
    if (k === thisYm) {
      monthDone += 1
      if (anchor && s.objectiveId === anchor.id) norteMonthDone += 1
    } else if (k === prevYm) {
      prevMonthDone += 1
    }
    if (anchor && s.objectiveId === anchor.id && nowMs - t <= 30 * DAY) norteStepsDone30d += 1
  }

  const efficacy: NorteEfficacy = !anchor ? 'sin_norte' : norteStepsDone30d > 0 ? 'avanzando' : 'sin_avances'
  const cadence: NorteCadence =
    monthDone === 0 && prevMonthDone === 0 ? 'sin_datos'
      : monthDone > prevMonthDone ? 'mejor'
      : monthDone < prevMonthDone ? 'peor'
      : 'igual'

  let message: string
  if (!anchor) {
    message = 'Sin un norte fijado no puedo medir si avanzás hacia él.'
  } else if (efficacy === 'sin_avances') {
    message = `Tu norte ("${anchor.title}") no tuvo avances reales (pasos completados) en 30 días. Atención no es lo mismo que progreso.`
  } else {
    message = `Avances reales en tu norte: ${norteStepsDone30d} paso(s) en 30 días.`
  }

  return {
    norteTitle: anchor?.title ?? null,
    norteProgress: anchor && typeof anchor.progress === 'number' ? anchor.progress : null,
    norteStepsDone30d,
    monthDone,
    prevMonthDone,
    norteMonthDone,
    efficacy,
    cadence,
    message,
  }
}
