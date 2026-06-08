// SIR V2 — Hábitos: nudge proactivo (lógica pura). Etapa 3 — loop comportamiento.
//
// A partir del estado de los hábitos, devuelve UN mensaje gentil para mostrar
// donde el usuario aterriza (Mission Control). Filosofía bienestar > culpa:
// un día perdido NO se reprocha; se invita a retomar. Sin emoji.
//
// Prioridad: (1) racha rota que vale la pena recuperar, (2) pendientes de hoy,
// (3) todo cumplido (refuerzo positivo). PURA + determinística.

import { computeHabitStreak } from './streak'

export type NudgeTone = 'recover' | 'nudge' | 'win'
export interface HabitNudge {
  tone: NudgeTone
  text: string
}

export interface NudgeHabit {
  title: string
  checkinDates: string[]
}

export function habitNudge(habits: NudgeHabit[], today: Date = new Date()): HabitNudge | null {
  if (!habits || habits.length === 0) return null

  const states = habits.map((h) => ({ title: h.title, s: computeHabitStreak(h.checkinDates, today) }))

  // (1) Recuperar: existió una racha real (>=3) y hoy está en 0 → invitar a retomar.
  const broke = states.find((x) => x.s.longest >= 3 && x.s.current === 0)
  if (broke) {
    return {
      tone: 'recover',
      text: `Se cortó tu racha de "${broke.title}". Un día no la define — retomala hoy.`,
    }
  }

  // (2) Pendientes de hoy.
  const undone = states.filter((x) => !x.s.doneToday)
  if (undone.length === 0) {
    return { tone: 'win', text: 'Marcaste todos tus hábitos hoy. Seguí así.' }
  }
  if (undone.length === states.length) {
    return { tone: 'nudge', text: `Arrancá el día: marcá tus ${states.length === 1 ? 'hábito' : 'hábitos'}.` }
  }
  return {
    tone: 'nudge',
    text: `Te ${undone.length === 1 ? 'falta 1 hábito' : `faltan ${undone.length} hábitos`} por marcar hoy.`,
  }
}
