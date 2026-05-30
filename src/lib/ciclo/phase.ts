// SIR V2 — Ciclo menstrual (util puro determinístico).
//
// Computa fase / día / próximo período desde:
//   - cycleStartDate (ISO YYYY-MM-DD = inicio del último período)
//   - cycleLengthDays (largo medio del ciclo en días, default 28)
//
// Modelo simplificado por paridad con SIR V1:
//   - Día 1 = inicio del período (sangrado).
//   - Menstrual: días 1-5 (5 días promedio).
//   - Folicular: días 6 hasta ovulación-1.
//   - Ovulación: días (largo - 14) ± 1 (ventana de 3 días).
//   - Lútea: desde fin de ovulación hasta el final del ciclo.
//
// Para un ciclo de 28 días:
//   menstrual: 1-5 · folicular: 6-12 · ovulación: 13-15 · lútea: 16-28
//
// Para un ciclo de 35 días:
//   menstrual: 1-5 · folicular: 6-19 · ovulación: 20-22 · lútea: 23-35
//
// LIMITACIONES asumidas (no es app médica):
//   - Asume ciclos regulares — variabilidad >7d hace todo unreliable.
//   - 5 días fijos de período (no preguntamos al usuario en esta sesion).
//   - No considera anticonceptivos hormonales ni embarazo.
//
// Notas contextuales: paridad V1 — strings estáticos por fase, sin LLM,
// sin recomendaciones médicas. Tono observacional, no prescriptivo.

import { parseLocalDate, toIsoLocal } from '@/lib/dates/parseLocalDate'

export type CyclePhaseId = 'menstrual' | 'follicular' | 'ovulation' | 'luteal'

export interface CyclePhase {
  phase: CyclePhaseId
  label: string
  /** Día del ciclo actual (1-based). Día 1 = inicio del período. */
  cycleDay: number
  /** Largo del ciclo en días (15-60). */
  cycleLength: number
  /** Fecha estimada del próximo período (ISO YYYY-MM-DD). */
  nextPeriodIso: string
  /** Días enteros hasta el próximo período. 0 = hoy. */
  daysUntilNextPeriod: number
  /** Texto contextual estatico para la fase (observacional, no prescriptivo). */
  contextNote: string
}

const DAY_MS = 86_400_000
const MENSTRUAL_DAYS = 5

const CONTEXT_NOTE: Record<CyclePhaseId, string> = {
  menstrual:
    'Fase de menstruación. Energía típicamente más baja, mayor sensibilidad emocional. ' +
    'Buen momento para descanso e introspección.',
  follicular:
    'Fase folicular. Energía y ánimo en alza, claridad mental creciente. ' +
    'Buen momento para iniciar proyectos y planes nuevos.',
  ovulation:
    'Ventana de ovulación. Pico de energía social y comunicación. ' +
    'Buen momento para conversaciones importantes y vínculos.',
  luteal:
    'Fase lútea. Energía decreciente progresiva, mayor introspección hacia el final. ' +
    'Buen momento para cerrar tareas y bajar el ritmo.',
}

function classifyPhase(cycleDay: number, cycleLength: number): CyclePhaseId {
  if (cycleDay <= MENSTRUAL_DAYS) return 'menstrual'
  // Día medio de ovulación: cycleLength - 14. Ventana ±1.
  const ovuMid = cycleLength - 14
  const ovuStart = ovuMid - 1
  const ovuEnd = ovuMid + 1
  if (cycleDay >= ovuStart && cycleDay <= ovuEnd) return 'ovulation'
  if (cycleDay < ovuStart) return 'follicular'
  return 'luteal'
}

const PHASE_LABEL: Record<CyclePhaseId, string> = {
  menstrual: 'Menstrual',
  follicular: 'Folicular',
  ovulation: 'Ovulación',
  luteal: 'Lútea',
}

/**
 * Computa la fase del ciclo de una persona.
 *
 * @param cycleStartDate Inicio del último período (ISO YYYY-MM-DD).
 * @param cycleLengthDays Largo del ciclo. Default 28. Clamp [15, 60].
 * @param today Fecha "ahora" (override para tests). Default: Date.now().
 * @returns CyclePhase, o null si la fecha es inválida.
 */
export function cyclePhase(
  cycleStartDate: string,
  cycleLengthDays: number = 28,
  today: Date = new Date(),
): CyclePhase | null {
  const start = parseLocalDate(cycleStartDate)
  if (!start) return null

  const length = Math.max(15, Math.min(60, Math.round(cycleLengthDays || 28)))
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffMs = todayStart.getTime() - start.getTime()
  if (diffMs < 0) return null // cycleStartDate en el futuro: no clasificamos.

  const daysSinceStart = Math.floor(diffMs / DAY_MS)
  // Modulo por el largo del ciclo. cycleDay es 1-based: día 1 = día de inicio.
  const cycleDay = (daysSinceStart % length) + 1
  const phase = classifyPhase(cycleDay, length)

  // Próximo período: el siguiente día 1 del ciclo, tras el día actual.
  const daysUntilNextPeriod = length - cycleDay + 1
  const nextPeriod = new Date(todayStart.getTime() + daysUntilNextPeriod * DAY_MS)
  const nextPeriodIso = toIsoLocal(nextPeriod)

  return {
    phase,
    label: PHASE_LABEL[phase],
    cycleDay,
    cycleLength: length,
    nextPeriodIso,
    daysUntilNextPeriod,
    contextNote: CONTEXT_NOTE[phase],
  }
}
